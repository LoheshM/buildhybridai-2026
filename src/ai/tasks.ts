// Every AI call Tickmark makes goes through this file. The routing is by DATA CLASS:
//   student sheets  -> ONLY_ON_DEVICE, behind the device gate, the student lock and the network guard
//   sample sheets   -> PREFER_ON_DEVICE, else a few live cloud reads, else recorded cloud readings
//   class totals    -> PREFER_IN_CLOUD (the SDK falls back to Gemini Nano on 429, App Check failure or
//                      network errors); ONLY_ON_DEVICE when the teacher keeps it on the laptop or is offline
import { CLOUD_READ_TIMEOUT_MS, DEVICE_TIMEOUT_MS, PLAN_TIMEOUT_CLOUD_MS, PLAN_TIMEOUT_DEVICE_MS, PLAN_TIMEOUT_HYBRID_MS } from '../config';
import { MIN_SHEETS, validatePayload, type ClassTotals } from '../privacy/aggregate';
import { currentSettings } from './firebase';
import { assertDeviceReady, deviceState } from './gate';
import type { SampleImage, StudentImage } from './images';
import { ledger, type DataClass, type Where } from './ledger';
import { canCallCloud, noteCloudCall } from './limiter';
import { InferenceMode, model, resetModel, type Mode, type Task } from './models';
import { blockCount, GuardBlocked, lastBlockReason, withStudentLock } from './netGuard';
import { readSheetPrompt, rereadPrompt, totalsPrompt, WARMUP_PROMPT } from './prompts';
import { CancelledError, enqueue, TimeoutError } from './queue';
import { coerceSheetRead, type SheetRead, type TotalsResponse } from './schemas';

export class OffDeviceAnswer extends Error {
  constructor() { super('A student sheet was answered somewhere other than this laptop. Tickmark stopped the batch.'); this.name = 'OffDeviceAnswer'; }
}

export type PlanProblem = 'limit' | 'offline' | 'quota' | 'blocked' | 'timeout' | 'device' | 'other';
export class PlanUnavailable extends Error {
  kind: PlanProblem;
  detail: string;
  constructor(kind: PlanProblem, detail: string) { super(PLAN_TEXT[kind]); this.name = 'PlanUnavailable'; this.kind = kind; this.detail = detail; }
}
const PLAN_TEXT: Record<PlanProblem, string> = {
  limit: 'This browser has reached its share of free cloud requests for now. Try again in a minute.',
  offline: "You're offline and this laptop has no on-device AI to write the plan instead.",
  quota: 'The free cloud AI is busy (rate limit). Try again in a minute.',
  blocked: 'Tickmark held the request back because it contained something that looked like a name from your class list.',
  timeout: 'The AI took too long to answer. Try again.',
  device: 'The on-device model is not ready on this laptop.',
  other: 'The plan could not be written just now. Try again.',
};

type Part = string | { type: 'inlineData'; inlineData: { mimeType: string; data: string } };
const imagePart = (img: { base64: string; mime: string }): Part => ({ type: 'inlineData', inlineData: { mimeType: img.mime, data: img.base64 } });

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new TimeoutError(ms, what)), ms); })]).finally(() => clearTimeout(t));
}

interface CallOpts { queue: boolean; timeoutMs: number; studentLock?: boolean; what?: string }
interface CallResult { text: string; where: Where; ms: number; heldBack?: string }

async function call(task: Task, mode: Mode, parts: Part[], dataClass: DataClass, label: string, o: CallOpts): Promise<CallResult> {
  const t0 = performance.now();
  const blocksBefore = blockCount();
  // The student lock covers only the SDK call itself, so queued cloud work never collides with it.
  const sdk = () => model(task, mode).generateContent(parts as never);
  const run = () => (o.studentLock ? withStudentLock(sdk) : sdk());
  try {
    const r = o.queue ? await enqueue(run, o.timeoutMs, o.what) : await withTimeout(run(), o.timeoutMs, o.what ?? 'cloud Gemini');
    const where: Where = r.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
    const heldBack = blockCount() > blocksBefore ? lastBlockReason() : undefined;
    ledger.addCall({ task: label, dataClass, mode, where, ms: Math.round(performance.now() - t0), ok: true, note: heldBack ? `Tickmark held back the cloud request (${heldBack}); Gemini Nano answered here.` : undefined });
    return { text: r.response.text(), where, ms: Math.round(performance.now() - t0), heldBack };
  } catch (e) {
    // A hung on-device prompt would block every later on-device call on this page: cancel it.
    if ((e as Error).name === 'TimeoutError') resetModel(task, mode);
    // The SDK wraps errors thrown inside fetch; recover our own guard's verdict from its counter.
    const err = blockCount() > blocksBefore ? new GuardBlocked(lastBlockReason() ?? 'blocked') : (e as Error);
    ledger.addCall({ task: label, dataClass, mode, where: err.name === 'GuardBlocked' ? 'blocked' : 'local', ms: Math.round(performance.now() - t0), ok: false, note: err.message.slice(0, 200) });
    throw err;
  }
}

const parseJson = (t: string) => JSON.parse(t.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));

// ---------------- on-device model setup ----------------
export async function initDeviceModel(onProgress?: (p: number) => void): Promise<void> {
  // Must be called from a click: Chrome only downloads the model after a user gesture.
  await model('warmup', InferenceMode.ONLY_ON_DEVICE).initializeDeviceModel(onProgress);
}

/** The first on-device call is slow (~15 s) while the model loads; do it before the teacher waits on a sheet. */
export async function warmUp(): Promise<number> {
  await assertDeviceReady();
  const r = await call('warmup', InferenceMode.ONLY_ON_DEVICE, [WARMUP_PROMPT], 'system', 'Warm up on-device model', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS });
  return r.ms;
}

// ---------------- student sheets: this laptop only ----------------
export interface ReadResult { read: SheetRead; where: Where; ms: number }

export async function readStudentSheet(img: StudentImage, questionCount: number): Promise<ReadResult> {
  await assertDeviceReady(); // the SDK would silently use the cloud if the model were missing
  const r = await call('readSheet', InferenceMode.ONLY_ON_DEVICE, [readSheetPrompt(questionCount), imagePart(img)], 'student', 'Read sheet', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS, studentLock: true });
  if (r.where !== 'on_device') throw new OffDeviceAnswer();
  return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
}

export async function rereadStudentQuestions(img: StudentImage, qs: number[]): Promise<{ answers: Map<number, SecondRead>; ms: number }> {
  await assertDeviceReady();
  const r = await call('reread', InferenceMode.ONLY_ON_DEVICE, [rereadPrompt(qs), imagePart(img)], 'student', 'Second read', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS, studentLock: true });
  if (r.where !== 'on_device') throw new OffDeviceAnswer();
  return { answers: rereadMap(parseJson(r.text), qs), ms: r.ms };
}

export interface SecondRead { final: string; crossed: string }
function rereadMap(x: unknown, qs: number[]): Map<number, SecondRead> {
  const out = new Map<number, SecondRead>();
  const arr = (x as { answers?: { q?: unknown; finalAnswer?: unknown; crossedOutText?: unknown }[] })?.answers ?? [];
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 40) : '');
  for (const a of arr) { const q = Number(a?.q); if (qs.includes(q) && !out.has(q)) out.set(q, { final: str(a.finalAnswer), crossed: str(a.crossedOutText) }); }
  return out;
}

// ---------------- synthetic sample sheets ----------------
export interface Recorded { recordedAt: string; model: string; reads: Record<string, SheetRead>; totals?: TotalsResponse; totalsPayload?: ClassTotals }
let recorded: Recorded | null = null;
let liveSampleReads = 0;
let cloudUnreachable = false;
let deviceFailures = 0;
export const setRecorded = (r: Recorded | null) => { recorded = r; };
export const recordedInfo = () => recorded;
export const resetLiveSampleReads = () => { liveSampleReads = 0; cloudUnreachable = false; deviceFailures = 0; };

export async function readSampleSheet(img: SampleImage, questionCount: number): Promise<ReadResult> {
  if ((await deviceState()) === 'available' && deviceFailures < 2) {
    try {
      const r = await call('readSheet', InferenceMode.PREFER_ON_DEVICE, [readSheetPrompt(questionCount), imagePart(img)], 'sample', 'Read sample sheet', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS });
      deviceFailures = 0;
      return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
    } catch (e) {
      if (e instanceof CancelledError || (e as Error).name === 'AbortError') throw e;
      deviceFailures++; // a slow or broken on-device model falls back for made-up sheets only
    }
  }
  if (!cloudUnreachable && liveSampleReads < currentSettings().sampleLiveReads && currentSettings().cloudFeaturesEnabled && canCallCloud()) {
    liveSampleReads++;
    noteCloudCall();
    try {
      // The device just failed or is missing: this read goes to the cloud explicitly (sample sheets only).
      const r = await call('readSheet', InferenceMode.ONLY_IN_CLOUD, [readSheetPrompt(questionCount), imagePart(img)], 'sample', 'Read sample sheet', { queue: false, timeoutMs: CLOUD_READ_TIMEOUT_MS, what: 'cloud Gemini' });
      return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
    } catch { cloudUnreachable = true; /* use the recording for the rest of this run */ }
  }
  const rec = recorded?.reads[img.sampleId];
  if (!rec) throw new Error('No recorded reading for this sample sheet.');
  ledger.addCall({ task: 'Read sample sheet', dataClass: 'sample', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Recorded cloud reading from ${recorded!.recordedAt}` });
  return { read: coerceSheetRead(rec, questionCount), where: 'recorded', ms: 0 };
}

/** Second read of a sample sheet: on this laptop only (it would cost shared cloud quota otherwise). */
export async function rereadSampleQuestions(img: SampleImage, qs: number[]): Promise<{ answers: Map<number, SecondRead>; ms: number } | null> {
  if ((await deviceState()) !== 'available' || deviceFailures >= 2) return null;
  try {
    const r = await call('reread', InferenceMode.PREFER_ON_DEVICE, [rereadPrompt(qs), imagePart(img)], 'sample', 'Second read (sample)', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS });
    return { answers: rereadMap(parseJson(r.text), qs), ms: r.ms };
  } catch (e) { if (e instanceof CancelledError) throw e; return null; }
}

// ---------------- anonymous class totals -> reteach plan + parent notes ----------------
export interface TotalsResult { response: TotalsResponse; where: Where; ms: number; heldBack?: string; mode: Mode | 'recorded'; payload: ClassTotals; note?: string; cloudTried?: boolean }

export async function planFromTotals(totals: ClassTotals, o: { sample: boolean; keepLocal: boolean; minK: number; sheets: number }): Promise<TotalsResult> {
  validatePayload(totals, o.minK); // closed schema: numbers and fixed words only
  if (o.sheets < MIN_SHEETS) throw new PlanUnavailable('other', `Needs at least ${MIN_SHEETS} marked sheets.`);
  const device = (await deviceState()) === 'available';
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const onDevice = async (why: string): Promise<TotalsResult> => {
    // Gemini Nano writes far fewer tokens per second: it gets the compact variant of the prompt.
    const r = await call('classTotals', InferenceMode.ONLY_ON_DEVICE, [totalsPrompt(totals, true)], 'totals', 'Reteach plan and parent notes', { queue: true, timeoutMs: PLAN_TIMEOUT_DEVICE_MS });
    return { response: parseJson(r.text) as TotalsResponse, where: r.where, ms: r.ms, mode: InferenceMode.ONLY_ON_DEVICE, payload: totals, note: why };
  };
  try {
    if (o.keepLocal) {
      // the teacher asked for nothing to leave the laptop: never fall through to the cloud
      if (!device) throw new PlanUnavailable('device', 'Gemini Nano is not ready on this laptop, so the plan was not written (nothing was sent).');
      return await onDevice('kept on this laptop');
    }
    if (offline || !currentSettings().cloudFeaturesEnabled || !canCallCloud()) {
      if (!device) throw new PlanUnavailable(offline ? 'offline' : !canCallCloud() ? 'limit' : 'device', offline ? 'offline' : 'cloud not available');
      return await onDevice(offline ? 'offline' : 'cloud not available');
    }
    noteCloudCall();
    try {
      // Hybrid: PREFER_IN_CLOUD lets the SDK fall back to Gemini Nano on 429, App Check failure or network
      // errors. Queued so it runs between sheets: no student lock can be held while its request leaves.
      const r = await call('classTotals', InferenceMode.PREFER_IN_CLOUD, [totalsPrompt(totals)], 'totals', 'Reteach plan and parent notes', { queue: true, timeoutMs: device ? PLAN_TIMEOUT_HYBRID_MS : PLAN_TIMEOUT_CLOUD_MS, what: device ? 'the AI' : 'cloud Gemini' });
      return { response: parseJson(r.text) as TotalsResponse, where: r.where, ms: r.ms, heldBack: r.heldBack, mode: InferenceMode.PREFER_IN_CLOUD, payload: totals };
    } catch (e) {
      // The SDK's own fallback sends the full prompt, which Gemini Nano can't finish in time: retry compact on the laptop.
      // Also after a guard block: Gemini Nano on this laptop is always allowed.
      if (device) { const r = await onDevice(`cloud tried: ${(e as Error).message.slice(0, 80)}`); return { ...r, cloudTried: true }; }
      throw e;
    }
  } catch (e) {
    const err = classify(e as Error);
    if (o.sample && recorded?.totals && !o.keepLocal) {
      ledger.addCall({ task: 'Reteach plan and parent notes', dataClass: 'totals', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Live AI unavailable (${err.message.slice(0, 80)}); showing the plan recorded on ${recorded.recordedAt}` });
      return { response: recorded.totals, where: 'recorded', ms: 0, mode: 'recorded', payload: recorded.totalsPayload ?? totals, note: err.message };
    }
    throw err;
  }
}

function classify(e: Error): PlanUnavailable {
  if (e instanceof PlanUnavailable) return e;
  if (e.name === 'GuardBlocked') return new PlanUnavailable('blocked', e.message);
  if (e.name === 'TimeoutError') return new PlanUnavailable('timeout', e.message);
  if (e.name === 'DeviceUnavailable') return new PlanUnavailable('device', e.message);
  const status = (e as { customErrorData?: { status?: number } }).customErrorData?.status;
  if (status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(e.message)) return new PlanUnavailable('quota', e.message);
  return new PlanUnavailable('other', e.message);
}

/**
 * "Test the guard yourself": tries to send a made-up student photo and a sentence with a name
 * from the (made-up) sample class list to the cloud. The network guard refuses both before
 * anything leaves the browser; the Outbox shows the refusals.
 */
export async function testGuard(rosterNames: string[]): Promise<{ what: string; blocked: boolean; reason: string }[]> {
  const { setRosterTokens, getRosterTokens, sha256Hex: _ } = await import('./netGuard');
  void _;
  const { rosterTokens } = await import('../privacy/nameCheck');
  const { AI_HOST } = await import('../config');
  const before = getRosterTokens();
  const names = rosterNames.length ? rosterNames : ['Meera Krishnan'];
  setRosterTokens([...new Set([...before, ...rosterTokens(names), 'meera', 'krishnan'])]);
  const canvas = new OffscreenCanvas(320, 200);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 320, 200);
  ctx.fillStyle = '#1b2f8a'; ctx.font = '28px sans-serif'; ctx.fillText('Name: Meera K.', 20, 60); ctx.fillText('2/3 + 1/6 = 3/9', 20, 120);
  const photo = await (await import('./images')).blobToBase64(await canvas.convertToBlob({ type: 'image/jpeg' }));
  const body = (parts: object[]) => JSON.stringify({ contents: [{ role: 'user', parts }] });
  const attempts: [string, string][] = [
    ['A photo that is not a made-up sample sheet', body([{ text: 'Read this worksheet.' }, { inlineData: { mimeType: 'image/jpeg', data: photo } }])],
    [`Text with a name from the class list ("${names[1] ?? names[0]}")`, body([{ text: `Write a note for ${names[1] ?? names[0]}, who scored 7 out of 10.` }])],
  ];
  const out: { what: string; blocked: boolean; reason: string }[] = [];
  try {
    for (const [what, b] of attempts) {
      try {
        // An already-aborted request: it passes through the guard, but can never reach the network.
        await fetch(`https://${AI_HOST}/v1beta/projects/guard-test/models/test:generateContent`, { method: 'POST', body: b, headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.abort() });
        out.push({ what, blocked: false, reason: 'not refused by the guard (and not sent: the test request was aborted)' });
      } catch (e) {
        out.push({ what, blocked: (e as Error).name === 'GuardBlocked', reason: (e as Error).name === 'GuardBlocked' ? (e as Error).message : 'not refused by the guard (and not sent: the test request was aborted)' });
      }
    }
  } finally { setRosterTokens(before); }
  return out;
}
