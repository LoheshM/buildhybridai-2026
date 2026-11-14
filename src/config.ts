// Public Firebase web config (not secret by design) and app-wide constants.
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyDE6yXl7iUq_brt3ktyub3kkqcjIPwLmuc',
  authDomain: 'buildhybridai-lohe.firebaseapp.com',
  projectId: 'buildhybridai-lohe',
  storageBucket: 'buildhybridai-lohe.firebasestorage.app',
  messagingSenderId: '377615547328',
  appId: '1:377615547328:web:ddc479738b1b6067a92625',
};
export const RECAPTCHA_ENTERPRISE_SITE_KEY = '6LcTZiAuAAAAACGFeJSag3fezzjK42lkFh1IysN1';

/** Cloud models we allow Remote Config to choose between. */
export const CLOUD_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] as const;
export const DEFAULT_CLOUD_MODEL = CLOUD_MODELS[0];

/** Host that Firebase AI Logic (Gemini Developer API backend) calls. */
export const AI_HOST = 'firebasevertexai.googleapis.com';

/** Options shared by our availability check and the SDK's on-device session, so both agree. */
export const DEVICE_EXPECTED_INPUTS = [{ type: 'text', languages: ['en'] }, { type: 'image' }] as const;
export const DEVICE_EXPECTED_OUTPUTS = [{ type: 'text', languages: ['en'] }] as const;

export const DEVICE_TIMEOUT_MS = 90_000;
export const BUILD = { commit: import.meta.env.VITE_COMMIT ?? 'dev', date: import.meta.env.VITE_BUILD_DATE ?? '' };
