// Firebase initialisation: App Check (reCAPTCHA Enterprise, enforced on AI Logic), Firebase AI
// Logic with limited-use App Check tokens, and Remote Config for operator settings.
// No Analytics, no Auth, no Firestore: nothing about a student is stored server-side.
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from 'firebase/remote-config';
import { CLOUD_MODELS, DEFAULT_CLOUD_MODEL, FIREBASE_CONFIG, RECAPTCHA_ENTERPRISE_SITE_KEY } from '../config';

let app: FirebaseApp | null = null;
let ai: AI | null = null;
let rc: RemoteConfig | null = null;

export function firebaseApp(): FirebaseApp {
  if (!app) app = initializeApp(FIREBASE_CONFIG, { automaticDataCollectionEnabled: false });
  return app;
}

let appCheckReady = false;
/**
 * App Check (and with it the reCAPTCHA script) is started only when a cloud request may follow:
 * planning a lesson, or the sample class without on-device AI. Pages with student data never load it.
 */
export function ensureAppCheck() {
  if (appCheckReady) return;
  appCheckReady = true;
  if (import.meta.env?.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) {
    // Local development only: the debug token never ships in a production build (checked by tools/check-dist.mjs).
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  }
  initializeAppCheck(firebaseApp(), { provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_ENTERPRISE_SITE_KEY), isTokenAutoRefreshEnabled: false });
}

export function aiInstance(): AI {
  if (!ai) { ensureAppCheck(); ai = getAI(firebaseApp(), { backend: new GoogleAIBackend(), useLimitedUseAppCheckTokens: true }); }
  return ai;
}

// ---- Remote Config: operator settings only. It can tighten behaviour, never loosen privacy. ----
export interface Settings { cloudModel: string; minGroupSize: number; cloudFeaturesEnabled: boolean; sampleLiveReads: number; source: 'default' | 'remote' }
const DEFAULTS = { cloud_model: DEFAULT_CLOUD_MODEL, min_group_size: 3, cloud_features_enabled: true, sample_cloud_live_reads: 3 };
let settings: Settings = { cloudModel: DEFAULT_CLOUD_MODEL, minGroupSize: 3, cloudFeaturesEnabled: true, sampleLiveReads: 3, source: 'default' };

export const currentSettings = () => settings;

/** Clamp remote values to safe ranges. Exported for tests. */
export function clampSettings(raw: { cloud_model?: string; min_group_size?: number; cloud_features_enabled?: boolean; sample_cloud_live_reads?: number }, source: Settings['source']): Settings {
  const model = (CLOUD_MODELS as readonly string[]).includes(raw.cloud_model ?? '') ? raw.cloud_model! : DEFAULT_CLOUD_MODEL;
  const k = Number.isFinite(raw.min_group_size) ? Math.min(10, Math.max(3, Math.floor(raw.min_group_size!))) : 3;
  const live = Number.isFinite(raw.sample_cloud_live_reads) ? Math.min(3, Math.max(0, Math.floor(raw.sample_cloud_live_reads!))) : 3;
  return { cloudModel: model, minGroupSize: k, cloudFeaturesEnabled: raw.cloud_features_enabled !== false, sampleLiveReads: live, source };
}

export async function loadRemoteSettings(): Promise<Settings> {
  try {
    rc = getRemoteConfig(firebaseApp());
    rc.settings.fetchTimeoutMillis = 5000;
    rc.settings.minimumFetchIntervalMillis = 60 * 60 * 1000;
    rc.defaultConfig = DEFAULTS;
    const fetched = await Promise.race([fetchAndActivate(rc).then(() => true).catch(() => false), new Promise<boolean>((r) => setTimeout(() => r(false), 6000))]);
    settings = clampSettings({
      cloud_model: getValue(rc, 'cloud_model').asString(),
      min_group_size: getValue(rc, 'min_group_size').asNumber(),
      cloud_features_enabled: getValue(rc, 'cloud_features_enabled').asBoolean(),
      sample_cloud_live_reads: getValue(rc, 'sample_cloud_live_reads').asNumber(),
    }, fetched && getValue(rc, 'cloud_model').getSource() === 'remote' ? 'remote' : 'default');
  } catch {
    settings = clampSettings(DEFAULTS, 'default');
  }
  return settings;
}
