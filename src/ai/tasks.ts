// Every AI call Tickmark makes goes through this file. The routing is by DATA CLASS:
//   student sheets  -> ONLY_ON_DEVICE, behind the device gate, the student lock and the network guard
//   sample sheets   -> PREFER_ON_DEVICE, else a few live cloud reads, else recorded cloud readings
//   class totals    -> PREFER_IN_CLOUD (the SDK falls back to Gemini Nano on 429, App Check failure or
//                      network errors); ONLY_ON_DEVICE when the teacher keeps it on the laptop or is offline
import { CLOUD_MODELS, CLOUD_READ_TIMEOUT_MS, DEVICE_TIMEOUT_MS, SUGGEST_TIMEOUT_MS, PLAN_TIMEOUT_CLOUD_MS, PLAN_TIMEOUT_DEVICE_MS, PLAN_TIMEOUT_HYBRID_MS } from '../config';
import { MIN_SHEETS, validatePayload, type ClassTotals } from '../privacy/aggregate';
import { currentSettings } from './firebase';
import { assertDeviceReady, deviceState } from './gate';
import type { SampleImage, StudentImage } from './images';
import { ledger, type DataClass, type Where } from './ledger';
import { canCallCloud, noteCloudCall } from './limiter';
import { InferenceMode, model, resetModel, type Mode, type Task } from './models';
import { blockCount, GuardBlocked, lastBlockReason, withStudentLock } from './netGuard';
import { answerSheetPrompt, stripPrompt, stripRereadPrompt, suggestPassagePrompt, suggestShortPrompt, totalsPrompt, WARMUP_PROMPT } from './prompts';
import { typeOf, type QuestionKey, type Suggestion } from '../marking/mark';
import { toSuggestion } from '../marking/open';
import { isOpen, keyPoints, parseRubric } from '../marking/qtypes';
import { CancelledError, enqueue, TimeoutError } from './queue';
import { capture, deviceReadFor, deviceSuggestionFor } from './deviceRecording';
import { coerceSheetRead, passageSuggestSchema, sheetSchema, shortSuggestSchema, stripSchema, type RawSuggestion, type SheetRead, type TotalsResponse } from './schemas';

export class OffDeviceAnswer extends Error {
  constructor() { super('A student sheet was answered somewhere other than this laptop. Tickmark stopped the batch.'); this.name = 'OffDeviceAnswer'; }
}

export type PlanProblem = 'limit' | 'offline' | 'quota' | 'blocked' | 'timeout' | 'device' | 'other' | 'quota_day' | 'invalid' | 'disabled';
export class PlanUnavailable extends Error {
  kind: PlanProblem;
  detail: string;
  constructor(kind: PlanProblem, detail: string) { super(PLAN_TEXT[kind]); this.name = 'PlanUnavailable'; this.kind = kind; this.detail = detail; }
}
const PLAN_TEXT: Record<PlanProblem, string> = {
  limit: 'This browser has reached its share of free cloud requests for now. Try again in a minute.',
  offline: "You're offline and this laptop has no on-device AI to write the plan instead.",
  quota: 'The free cloud AI is busy (rate limit). Try again in a minute.',
  quota_day: "Today's free cloud allowance for Tickmark is used up; it resets at midnight Pacific time (13:30 in India). On a laptop with Gemini Nano the plan is written on the laptop instead.",
  blocked: 'Tickmark held the request back because it contained something that looked like a name from your class list.',
  timeout: 'The AI took too long to answer. Try again.',
  device: 'The on-device model is not ready on this laptop.',
  other: 'The plan could not be written just now. Try again.',
  invalid: "Tickmark couldn't build the class totals from this quiz's key, so nothing was sent.",
  disabled: 'Cloud AI is switched off for Tickmark right now, and this laptop has no on-device AI to write the plan instead.',
};

type Part = string | { type: 'inlineData'; inlineData: { mimeType: string; data: string } };
const imagePart = (img: { base64: string; mime: string }): Part => ({ type: 'inlineData', inlineData: { mimeType: img.mime, data: img.base64 } });

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, rej) => { t = setTimeout(() => rej(new TimeoutError(ms, what)), ms); })]).finally(() => clearTimeout(t));
}

interface CallOpts { queue: boolean; timeoutMs: number; studentLock?: boolean; what?: string; schema?: object; cloudModel?: string }
interface CallResult { text: string; where: Where; ms: number; heldBack?: string }

async function call(task: Task, mode: Mode, parts: Part[], dataClass: DataClass, label: string, o: CallOpts): Promise<CallResult> {
  const t0 = performance.now();
  const blocksBefore = blockCount();
  // The student lock covers only the SDK call itself, so queued cloud work never collides with it.
  const sdk = () => model(task, mode, o.schema, o.cloudModel).generateContent(parts as never);
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

// ---------------- pupils' sheets: this laptop only, as a strip of answer boxes (readStrip below) ----------------
export interface ReadResult { read: SheetRead; where: Where; ms: number }



export interface SecondRead { final: string; crossed: string }
function rereadMap(x: unknown, qs: number[]): Map<number, SecondRead> {
  const out = new Map<number, SecondRead>();
  const arr = (x as { answers?: { q?: unknown; finalAnswer?: unknown; crossedOutText?: unknown }[] })?.answers ?? [];
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, 1200) : '');
  for (const a of arr) { const q = Number(a?.q); if (qs.includes(q) && !out.has(q)) out.set(q, { final: str(a.finalAnswer), crossed: str(a.crossedOutText) }); }
  return out;
}

// ---------------- the strip: answer boxes cut from a Tickmark answer sheet ----------------
/**
 * Reads the strip of answer boxes on this laptop only. Used for pupils' sheets (always) and for the
 * made-up sample sheets when Gemini Nano is ready. Boxes code found empty are not sent at all and
 * come back as blank answers; a model asked about an empty box invents one.
 */
export async function readStrip(img: StudentImage, keys: QuestionKey[], blank: number[], dataClass: 'student' | 'sample'): Promise<ReadResult> {
  await assertDeviceReady();
  const written = keys.filter((k) => !blank.includes(k.q));
  const r = await call('readSheet', InferenceMode.ONLY_ON_DEVICE, [stripPrompt(written), imagePart(img)], dataClass, dataClass === 'student' ? 'Read sheet' : 'Read sample sheet', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS, studentLock: true, schema: stripSchema(written.map((k) => k.q)) });
  if (r.where !== 'on_device') throw new OffDeviceAnswer();
  const read = coerceSheetRead(parseJson(r.text), Math.max(0, ...keys.map((k) => k.q)));
  for (const a of read.answers) if (blank.includes(a.q)) { a.finalAnswer = ''; a.crossedOutText = ''; }
  return { read, where: r.where, ms: r.ms };
}

export async function rereadStrip(img: StudentImage, qs: number[], keys: QuestionKey[], dataClass: 'student' | 'sample'): Promise<{ answers: Map<number, SecondRead>; ms: number }> {
  await assertDeviceReady();
  const r = await call('reread', InferenceMode.ONLY_ON_DEVICE, [stripRereadPrompt(qs, keys), imagePart(img)], dataClass, 'Second read', { queue: true, timeoutMs: DEVICE_TIMEOUT_MS, studentLock: true });
  if (r.where !== 'on_device') throw new OffDeviceAnswer();
  return { answers: rereadMap(parseJson(r.text), qs), ms: r.ms };
}

// ---------------- synthetic sample sheets ----------------
export interface Recorded {
  recordedAt: string; model: string; reads: Record<string, SheetRead>;
  /** Cloud suggestions for open answers, keyed "<sample id>:<question>". */
  suggestions?: Record<string, RawSuggestion>;
  totals?: TotalsResponse; totalsPayload?: ClassTotals;
}
const recordings = new Map<string, Recorded>(); // sample class -> its recordings
let liveSampleReads = 0;
let cloudUnreachable = false;
let deviceFailures = 0;
export const setRecorded = (cls: string, r: Recorded) => { recordings.set(cls, r); };
/** Recordings that hold this sample sheet (sample ids are unique across classes). */
const recordingFor = (sampleId: string) => [...recordings.values()].find((r) => r.reads[sampleId]) ?? null;
export const recordedInfo = (cls: string) => recordings.get(cls) ?? null;
export const resetLiveSampleReads = () => { liveSampleReads = 0; cloudUnreachable = false; deviceFailures = 0; };

/**
 * A made-up sample sheet when Gemini Nano can't read it here (missing, downloading, or failed twice):
 * a few live cloud reads of the sample photo itself (its fingerprint is on the allowlist), then the
 * cloud readings recorded on 15 Nov. The on-device path for samples is the strip (runner + readStrip).
 */
export async function readSampleSheet(img: SampleImage, keys: QuestionKey[]): Promise<ReadResult> {
  const questionCount = keys.length;
  // first choice without Nano here: Nano's own reading of this sheet, recorded on the author's laptop
  const dev = deviceReadFor(img.sampleId);
  if (dev) {
    ledger.addCall({ task: 'Read sample sheet', dataClass: 'sample', mode: 'recorded', where: 'recorded_device', ms: dev.read.firstMs, ok: true, note: `Gemini Nano's reading, recorded on ${dev.rec.recordedAt} (${dev.rec.chrome})` });
    return { read: coerceSheetRead(structuredClone(dev.read.first), questionCount), where: 'recorded_device', ms: dev.read.firstMs };
  }
  if (!cloudUnreachable && liveSampleReads < currentSettings().sampleLiveReads && currentSettings().cloudFeaturesEnabled && canCallCloud()) {
    liveSampleReads++;
    noteCloudCall();
    try {
      const r = await call('readSheet', InferenceMode.ONLY_IN_CLOUD, [answerSheetPrompt(keys), imagePart(img)], 'sample', 'Read sample sheet', { queue: false, timeoutMs: CLOUD_READ_TIMEOUT_MS, what: 'cloud Gemini', schema: sheetSchema(questionCount) });
      return { read: coerceSheetRead(parseJson(r.text), questionCount), where: r.where, ms: r.ms };
    } catch { cloudUnreachable = true; /* use the recording for the rest of this run */ }
  }
  const rec = recordingFor(img.sampleId)?.reads[img.sampleId];
  if (!rec) throw new Error('No recorded reading for this sample sheet.');
  ledger.addCall({ task: 'Read sample sheet', dataClass: 'sample', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Recorded cloud reading from ${recordingFor(img.sampleId)!.recordedAt}` });
  return { read: coerceSheetRead(rec, questionCount), where: 'recorded', ms: 0 };
}

/** The runner calls this when Nano fails on a sample strip, so the rest of the run uses the cloud path. */
export const noteSampleDeviceFailure = () => { deviceFailures++; };
/** A good on-device read clears the count: only a run of failures (a broken model) switches the samples to the cloud. */
export const noteSampleDeviceSuccess = () => { deviceFailures = 0; };
export const sampleDeviceUsable = async () => (await deviceState()) === 'available' && deviceFailures < 3;


// ---------------- open answers: a suggested mark, the teacher decides ----------------
/**
 * Suggests a mark for one open answer from the text that was read. A student's words are only ever
 * sent to Gemini Nano on this laptop (gate, student lock, network guard). Sample answers use Nano
 * when it is ready, otherwise the suggestion recorded from cloud Gemini. Returns null when there is
 * no suggestion (the teacher marks it by hand); a wedged model never blocks the batch.
 */
export async function suggestOpen(text: string, key: QuestionKey, who: { student: true } | { sample: string; deviceOnly?: boolean }): Promise<Suggestion | null> {
  const type = typeOf(key);
  if (!text.trim() || !isOpen(type)) return null;
  const rubric = parseRubric(key.answer) ?? [];
  const prompt = type === 'passage' ? suggestPassagePrompt(key.prompt, rubric, text) : suggestShortPrompt(key.prompt, keyPoints(key.answer), text);
  const schema = type === 'passage' ? passageSuggestSchema(rubric.map((r) => r.max)) : shortSuggestSchema(keyPoints(key.answer).length || 1);
  const student = 'student' in who;
  const deviceOnly = student || !!(who as { deviceOnly?: boolean }).deviceOnly; // a strip read on the laptop is suggested on the laptop too
  if (deviceOnly) await assertDeviceReady();
  const live = deviceOnly || ((await deviceState()) === 'available' && deviceFailures < 2);
  if (live) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await call('suggest', deviceOnly ? InferenceMode.ONLY_ON_DEVICE : InferenceMode.PREFER_ON_DEVICE, [prompt], student ? 'student' : 'sample', student ? 'Suggest a mark' : 'Suggest a mark (sample)', { queue: true, timeoutMs: SUGGEST_TIMEOUT_MS, studentLock: deviceOnly, schema });
        if (deviceOnly && r.where !== 'on_device') throw new OffDeviceAnswer();
        const raw = parseJson(r.text) as RawSuggestion;
        if (capture && !student && r.where === 'on_device') capture.suggestions[`${(who as { sample: string }).sample}:${key.q}`] = { raw: structuredClone(raw), ms: r.ms };
        return toSuggestion(key, raw, r.where === 'on_device' ? 'on_device' : 'in_cloud', r.ms);
      } catch (e) {
        if (e instanceof CancelledError || (e as Error).name === 'AbortError' || (e as Error).name === 'OffDeviceAnswer' || (e as Error).name === 'GuardBlocked') throw e;
        if ((e as Error).name !== 'TimeoutError' && (e as Error).name !== 'SyntaxError') break;
      }
    }
    if (student) return null;
    deviceFailures++;
    if (deviceOnly) return null;
  }
  const sampleId = (who as { sample: string }).sample;
  const dev = deviceSuggestionFor(sampleId, key.q);
  if (dev) {
    ledger.addCall({ task: 'Suggest a mark (sample)', dataClass: 'sample', mode: 'recorded', where: 'recorded_device', ms: dev.s.ms, ok: true, note: `Gemini Nano's suggestion, recorded on ${dev.rec.recordedAt}` });
    return toSuggestion(key, structuredClone(dev.s.raw), 'recorded_device', dev.s.ms);
  }
  const rec = recordingFor(sampleId)?.suggestions?.[`${sampleId}:${key.q}`];
  if (!rec) return null;
  ledger.addCall({ task: 'Suggest a mark (sample)', dataClass: 'sample', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Recorded cloud suggestion from ${recordingFor(sampleId)!.recordedAt}` });
  return toSuggestion(key, rec, 'recorded', 0);
}

// ---------------- anonymous class totals -> reteach plan + parent notes ----------------
export interface TotalsResult { response: TotalsResponse; where: Where; ms: number; heldBack?: string; mode: Mode | 'recorded'; payload: ClassTotals; note?: string; cloudTried?: boolean }

export async function planFromTotals(totals: ClassTotals, o: { sample: boolean; sampleClass?: string; keepLocal: boolean; minK: number; sheets: number }): Promise<TotalsResult> {
  const recorded = o.sampleClass ? recordings.get(o.sampleClass) ?? null : null;
  // closed schema: numbers and fixed words only. A key it can't express is named, never "try again".
  try { validatePayload(totals, o.minK); } catch (e) {
    const q = (e as Error).message.match(/question (\d+)/)?.[1];
    const pu = new PlanUnavailable('invalid', (e as Error).message);
    if (q) pu.message = `Question ${q}'s key has text Tickmark can't put in the class totals, so nothing was sent. Shorten that key or its question, then send again.`;
    throw pu;
  }
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
      if (!device) throw new PlanUnavailable(offline ? 'offline' : !currentSettings().cloudFeaturesEnabled ? 'disabled' : 'limit', offline ? 'offline' : 'cloud not available');
      return await onDevice(offline ? 'offline' : 'cloud not available');
    }
    noteCloudCall();
    try {
      // Hybrid: PREFER_IN_CLOUD lets the SDK fall back to Gemini Nano on 429, App Check failure or network
      // errors. Queued so it runs between sheets: no student lock can be held while its request leaves.
      const r = await call('classTotals', InferenceMode.PREFER_IN_CLOUD, [totalsPrompt(totals)], 'totals', 'Reteach plan and parent notes', { queue: true, timeoutMs: device ? PLAN_TIMEOUT_HYBRID_MS : PLAN_TIMEOUT_CLOUD_MS, what: device ? 'the AI' : 'cloud Gemini' });
      return { response: parseJson(r.text) as TotalsResponse, where: r.where, ms: r.ms, heldBack: r.heldBack, mode: InferenceMode.PREFER_IN_CLOUD, payload: totals };
    } catch (e) {
      // The free daily allowance is per model: one retry, same validated totals, on the other allowlisted model.
      const alt = CLOUD_MODELS.find((m) => m !== currentSettings().cloudModel);
      if (alt && classifyPlanError(e as Error).kind === 'quota_day' && canCallCloud()) {
        noteCloudCall();
        try {
          const r = await call('classTotals', InferenceMode.ONLY_IN_CLOUD, [totalsPrompt(totals)], 'totals', 'Reteach plan and parent notes', { queue: true, timeoutMs: PLAN_TIMEOUT_CLOUD_MS, what: 'cloud Gemini', cloudModel: alt });
          ledger.addCall({ task: 'Reteach plan and parent notes', dataClass: 'totals', mode: InferenceMode.ONLY_IN_CLOUD, where: 'in_cloud', ms: r.ms, ok: true, note: `Written by ${alt}: the daily allowance of ${currentSettings().cloudModel} was used up` });
          return { response: parseJson(r.text) as TotalsResponse, where: r.where, ms: r.ms, mode: InferenceMode.ONLY_IN_CLOUD, payload: totals, note: `written by ${alt}` };
        } catch { /* fall through to the laptop or the recording */ }
      }
      // The SDK's own fallback sends the full prompt, which Gemini Nano can't finish in time: retry compact on the laptop.
      // Also after a guard block: Gemini Nano on this laptop is always allowed.
      if (device) { const r = await onDevice(`cloud tried: ${(e as Error).message.slice(0, 80)}`); return { ...r, cloudTried: true }; }
      throw e;
    }
  } catch (e) {
    const err = classifyPlanError(e as Error);
    if (o.sample && recorded?.totals && !o.keepLocal) {
      ledger.addCall({ task: 'Reteach plan and parent notes', dataClass: 'totals', mode: 'recorded', where: 'recorded', ms: 0, ok: true, note: `Live AI unavailable (${err.message.slice(0, 80)}); showing the plan recorded on ${recorded.recordedAt}` });
      return { response: recorded.totals, where: 'recorded', ms: 0, mode: 'recorded', payload: recorded.totalsPayload ?? totals, note: err.message };
    }
    throw err;
  }
}

export function classifyPlanError(e: Error): PlanUnavailable {
  if (e instanceof PlanUnavailable) return e;
  if (e.name === 'GuardBlocked') {
    // say what the guard actually saw (it isn't always a name)
    const p = new PlanUnavailable('blocked', e.message);
    if (/student sheet was being read/.test(e.message)) p.message = 'Tickmark held the request back because a pupil sheet was being read on this laptop at that moment. Send the class totals again when the reading has finished.';
    else if (/image|file reference/.test(e.message)) p.message = 'Tickmark held the request back because it carried an image that is not one of the made-up sample sheets.';
    return p;
  }
  if (e.name === 'TimeoutError') return new PlanUnavailable('timeout', e.message);
  if (e.name === 'DeviceUnavailable') return new PlanUnavailable('device', e.message);
  const status = (e as { customErrorData?: { status?: number } }).customErrorData?.status;
  const details = JSON.stringify((e as { customErrorData?: unknown }).customErrorData ?? '');
  if (status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(e.message)) return new PlanUnavailable(/PerDay|per day|daily/i.test(`${e.message} ${details}`) ? 'quota_day' : 'quota', e.message);
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
