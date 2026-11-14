// Every AI call Tickmark makes goes through this file. The routing is by DATA CLASS:
//   student sheets  -> ONLY_ON_DEVICE, behind the device gate, the student lock and the network guard
//   sample sheets   -> PREFER_ON_DEVICE, else a few live cloud reads, else recorded cloud readings
//   class totals    -> PREFER_IN_CLOUD (falls back to Gemini Nano on 429, App Check failure or offline)
import { DEVICE_TIMEOUT_MS } from '../config';
import { MIN_SHEETS, validatePayload, type ClassTotals } from '../privacy/aggregate';
import { currentSettings } from './firebase';
import { assertDeviceReady, deviceState } from './gate';
import type { SampleImage, StudentImage } from './images';
import { ledger, type DataClass, type Where } from './ledger';
import { InferenceMode, model, type Mode, type Task } from './models';
import { withStudentLock } from './netGuard';
import { readSheetPrompt, rereadPrompt, totalsPrompt, WARMUP_PROMPT } from './prompts';
import { enqueue } from './queue';
import { coerceSheetRead, type SheetRead, type TotalsResponse } from './schemas';
import { canCallCloud, noteCloudCall } from './limiter';

export class OffDeviceAnswer extends Error {
  constructor() { super('A student sheet was answered somewhere other than this laptop. Tickmark stopped the batch.'); this.name = 'OffDeviceAnswer'; }
}

type Part = string | { type: 'inlineData'; inlineData: { mimeType: string; data: string } };
const imagePart = (img: { base64: string; mime: string }): Part => ({ type: 'inlineData', inlineData: { mimeType: img.mime, data: img.base64 } });

async function call(task: Task, mode: Mode, parts: Part[], dataClass: DataClass, label: string, device: boolean) {
  const t0 = performance.now();
  const run = () => model(task, mode).generateContent(parts as never);
  try {
    const r = device ? await enqueue(run, DEVICE_TIMEOUT_MS) : await run();
    const where: Where = r.response.inferenceSource === 'on_device' ? 'on_device' : 'in_cloud';
    ledger.addCall({ task: label, dataClass, mode, where, ms: Math.round(performance.now() - t0), ok: true });
    return { text: r.response.text(), where, ms: Math.round(performance.now() - t0) };
  } catch (e) {
    ledger.addCall({ task: label, dataClass, mode, where: (e as Error).name === 'GuardBlocked' ? 'blocked' : 'local', ms: Math.round(performance.now() - t0), ok: false, note: (e as Error).message.slice(0, 200) });
    throw e;
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
  const r = await withStudentLock(() => call('warmup', InferenceMode.ONLY_ON_DEVICE, [WARMUP_PROMPT], 'system', 'Warm up on-device model', true));
  return r.ms;
}

// ---------------- student sheets: this laptop only ----------------
export interface ReadResult { read: SheetRead; where: Where; ms: number; reread?: { qs: number[]; answers: Map<number, string>; ms: number } }

export async function readStudentSheet(img: StudentImage, questionCount: number): Promise<ReadResult> {
  await assertDeviceReady(); // the SDK would silently use the cloud if the model were missing
  return withStudentLock(async () => {
    const r = await call('readSheet', InferenceMode.ONLY_ON_DEVICE, [readSheetPrompt(questionCount), imagePart(img)], 'student', 'Read sheet', true);
    if (r.where !== 'on_device') throw new OffDeviceAnswer();
    return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
  });
}

export async function rereadStudentQuestions(img: StudentImage, qs: number[]): Promise<{ answers: Map<number, string>; ms: number }> {
  await assertDeviceReady();
  return withStudentLock(async () => {
    const r = await call('reread', InferenceMode.ONLY_ON_DEVICE, [rereadPrompt(qs), imagePart(img)], 'student', 'Second read', true);
    if (r.where !== 'on_device') throw new OffDeviceAnswer();
    return { answers: rereadMap(parseJson(r.text), qs), ms: r.ms };
  });
}

function rereadMap(x: unknown, qs: number[]): Map<number, string> {
  const out = new Map<number, string>();
  const arr = (x as { answers?: { q?: unknown; finalAnswer?: unknown }[] })?.answers ?? [];
  for (const a of arr) { const q = Number(a?.q); if (qs.includes(q) && !out.has(q)) out.set(q, String(a.finalAnswer ?? '').slice(0, 40)); }
  return out;
}

// ---------------- synthetic sample sheets ----------------
export interface Recorded { recordedAt: string; model: string; reads: Record<string, SheetRead>; totals?: TotalsResponse }
let recorded: Recorded | null = null;
let liveSampleReads = 0;
export const setRecorded = (r: Recorded | null) => { recorded = r; };
export const resetLiveSampleReads = () => { liveSampleReads = 0; };

export async function readSampleSheet(img: SampleImage, questionCount: number): Promise<ReadResult> {
  const state = await deviceState();
  if (state === 'available') {
    const r = await call('readSheet', InferenceMode.PREFER_ON_DEVICE, [readSheetPrompt(questionCount), imagePart(img)], 'sample', 'Read sample sheet', true);
    return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
  }
  if (liveSampleReads < currentSettings().sampleLiveReads && canCallCloud()) {
    liveSampleReads++;
    noteCloudCall();
    try {
      const r = await call('readSheet', InferenceMode.PREFER_ON_DEVICE, [readSheetPrompt(questionCount), imagePart(img)], 'sample', 'Read sample sheet', false);
      return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
    } catch { /* fall through to the recording */ }
  }
  const rec = recorded?.reads[img.sampleId];
  if (!rec) throw new Error('No recorded reading for this sample sheet.');
  ledger.addCall({ task: 'Read sample sheet', dataClass: 'sample', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Recorded cloud reading, ${recorded!.recordedAt}` });
  return { read: coerceSheetRead(rec, questionCount), where: 'recorded', ms: 0 };
}

/** Second read of a sample sheet: on this laptop only (it would cost shared cloud quota otherwise). */
export async function rereadSampleQuestions(img: SampleImage, qs: number[]): Promise<{ answers: Map<number, string>; ms: number } | null> {
  if ((await deviceState()) !== 'available') return null;
  const r = await call('reread', InferenceMode.PREFER_ON_DEVICE, [rereadPrompt(qs), imagePart(img)], 'sample', 'Second read (sample)', true);
  return { answers: rereadMap(parseJson(r.text), qs), ms: r.ms };
}

// ---------------- anonymous class totals -> reteach plan + parent notes ----------------
export interface TotalsResult { response: TotalsResponse; where: Where; ms: number }

export async function planFromTotals(totals: ClassTotals): Promise<TotalsResult> {
  validatePayload(totals); // closed schema: numbers and fixed words only
  if (totals.sheets < MIN_SHEETS) throw new Error(`Needs at least ${MIN_SHEETS} marked sheets.`);
  const cloudOk = currentSettings().cloudFeaturesEnabled && canCallCloud();
  const mode = cloudOk ? InferenceMode.PREFER_IN_CLOUD : InferenceMode.ONLY_ON_DEVICE;
  if (!cloudOk) await assertDeviceReady();
  if (cloudOk) noteCloudCall();
  try {
    const r = await call('classTotals', mode, [totalsPrompt(totals)], 'totals', 'Reteach plan and parent notes', true);
    return { response: parseJson(r.text) as TotalsResponse, where: r.where, ms: r.ms };
  } catch (e) {
    if (recorded?.totals && totals.sheets === 28) {
      ledger.addCall({ task: 'Reteach plan and parent notes', dataClass: 'totals', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Live AI unavailable (${(e as Error).message.slice(0, 80)}); showing the recorded answer from ${recorded.recordedAt}` });
      return { response: recorded.totals, where: 'recorded', ms: 0 };
    }
    throw e;
  }
}
