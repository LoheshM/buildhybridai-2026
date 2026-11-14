// Reads queued sheets one by one: classify the image, read it on the right side, mark it in
// code, ask for a second read where needed, match the name to the roster, save.
// The runner lives at module level, so a run keeps going while the teacher moves between pages.
import { classify, isSample, type SampleImage, type StudentImage } from '../ai/images';
import { readSampleSheet, readStudentSheet, rereadSampleQuestions, rereadStudentQuestions, resetLiveSampleReads } from '../ai/tasks';
import { cancelQueued } from '../ai/queue';
import { markRead, mergeReread, rereadQuestions } from '../marking/pipeline';
import { matchName } from '../marking/roster';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';

export interface RunState { running: boolean; quizId?: string; done: number; total: number; current?: string; avgMs: number; error?: string }
type Listener = (s: RunState) => void;
let state: RunState = { running: false, done: 0, total: 0, avgMs: 0 };
const listeners = new Set<Listener>();
const sheetListeners = new Set<(s: SheetRec) => void>();
let stopRequested = false;
const emit = (patch: Partial<RunState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l(state)); };
export const runState = () => state;
export const onRun = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Fires after every sheet the runner saves, whichever page is open. */
export const onSheetChanged = (l: (s: SheetRec) => void) => { sheetListeners.add(l); return () => { sheetListeners.delete(l); }; };

export function stopRun() { stopRequested = true; cancelQueued(); }

class OutOfSpace extends Error { constructor() { super('This browser is out of storage space. Delete the photos of quizzes you have already checked (Results page), then try again.'); this.name = 'OutOfSpace'; } }

async function save(s: SheetRec) {
  try { await store.putSheet(s); }
  catch (e) { if ((e as Error).name === 'QuotaExceededError') throw new OutOfSpace(); throw e; }
  sheetListeners.forEach((l) => l(s));
}

async function imageFor(sheet: SheetRec): Promise<Blob> {
  if (sheet.source === 'sample' && sheet.sampleId) {
    const r = await fetch(`/samples/${sheet.sampleId}.jpg`);
    if (!r.ok) throw new Error('Sample photo missing');
    return r.blob();
  }
  const b = sheet.imageId ? await store.image(sheet.imageId) : undefined;
  if (!b) throw new Error('Photo not found (it may have been deleted).');
  return b;
}

const RETRYABLE = new Set(['TimeoutError', 'SyntaxError', 'AbortError']);
const STOPS_BATCH = new Set(['DeviceUnavailable', 'GuardBlocked', 'OffDeviceAnswer', 'OutOfSpace']);

export async function runQuiz(cls: ClassRec, quiz: QuizRec, limit = Infinity): Promise<void> {
  if (state.running) return;
  emit({ running: true, quizId: quiz.id, done: 0, total: 0, error: undefined, current: undefined }); // claim before any await
  stopRequested = false;
  if (cls.sample) resetLiveSampleReads();
  let totalMs = 0;
  let timeoutsInARow = 0;
  try {
    // A sheet left "reading" by a reload or crash is stale here: nothing else is running.
    const all = await store.sheets(quiz.id);
    const queued = all.filter((s) => s.status === 'queued' || s.status === 'error' || s.status === 'reading').slice(0, limit);
    const taken = new Set(all.filter((s) => !queued.includes(s)).map((s) => s.studentId).filter((x): x is string => !!x));
    emit({ total: queued.length, avgMs: state.avgMs || 11000 });
    for (const sheet of queued) {
      if (stopRequested) break;
      if (!(await store.quiz(quiz.id))) break; // the quiz was deleted mid-run
      emit({ current: sheet.fileName ?? sheet.sampleId ?? sheet.id });
      let s: SheetRec = { ...sheet, status: 'reading', error: undefined };
      await save(s);
      const t0 = performance.now();
      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 2 && !stopRequested; attempt++) {
        try {
          lastErr = null;
          const img = await classify(await imageFor(sheet));
          const n = quiz.keys.length;
          if (sheet.source === 'sample' && !isSample(img)) throw new Error('Sample photo does not match its fingerprint; refusing to send it anywhere.');
          const first = isSample(img) ? await readSampleSheet(img, n) : await readStudentSheet(img as StudentImage, n);
          let marks = markRead(quiz.keys, first.read);
          const qs = rereadQuestions(quiz.keys, marks);
          let rereadMs: number | undefined;
          if (qs.length && first.where === 'on_device') {
            const second = isSample(img) ? await rereadSampleQuestions(img as SampleImage, qs) : await rereadStudentQuestions(img as StudentImage, qs);
            if (second) { marks = mergeReread(marks, second.answers); rereadMs = second.ms; }
          }
          const match = matchName(first.read.studentName, cls.roster, taken);
          if (match.studentId) taken.add(match.studentId);
          s = { ...s, status: 'read', read: first.read, readName: first.read.studentName, studentId: match.studentId, nameConfident: match.confident, marks, where: first.where, ms: first.ms, rereadQs: qs, rereadMs };
          break;
        } catch (e) {
          lastErr = e as Error;
          if (!RETRYABLE.has(lastErr.name)) break; // a hung or garbled answer gets one automatic retry
        }
      }
      if (lastErr) s = { ...s, status: lastErr.name === 'CancelledError' ? 'queued' : 'error', error: lastErr.name === 'CancelledError' ? undefined : friendly(lastErr) };
      if (s.status === 'reading') s = { ...s, status: 'queued' }; // stopped before an answer came back
      totalMs += performance.now() - t0;
      if (await store.quiz(quiz.id)) await save(s);
      emit({ done: state.done + 1, avgMs: Math.round(totalMs / (state.done + 1)) });
      if (lastErr && STOPS_BATCH.has(lastErr.name)) { emit({ error: s.error }); break; }
      timeoutsInARow = lastErr?.name === 'TimeoutError' ? timeoutsInARow + 1 : 0;
      if (timeoutsInARow >= 2) { emit({ error: 'The on-device model stopped responding. Reload the page (Ctrl+R) to restart it, then click Read the rest: your sheets so far are saved.' }); break; }
    }
  } catch (e) {
    emit({ error: friendly(e as Error) });
  } finally {
    emit({ running: false, current: undefined });
  }
}

/** Sample sheets read by cloud Gemini or from recordings, re-queued to be read on this laptop. */
export async function requeueForDevice(quizId: string): Promise<number> {
  let n = 0;
  for (const s of await store.sheets(quizId)) {
    if ((s.status === 'read' || s.status === 'checked') && s.where !== 'on_device' && s.source === 'sample') {
      await store.putSheet({ ...s, status: 'queued', marks: [], read: undefined, where: undefined, ms: undefined, studentId: null, nameConfident: false, readName: '', rereadQs: undefined, rereadMs: undefined, error: undefined, checkedAt: undefined });
      n++;
    }
  }
  return n;
}

export function friendly(e: Error): string {
  switch (e.name) {
    case 'DeviceUnavailable': return `${e.message} Student sheets are only ever read on this laptop, so Tickmark stopped instead of uploading.`;
    case 'GuardBlocked': case 'OffDeviceAnswer': case 'OutOfSpace': return e.message;
    case 'TimeoutError': return `${e.message}. Try this sheet again.`;
    case 'CancelledError': return 'Stopped.';
    case 'SyntaxError': return "The AI's answer for this sheet wasn't readable. Try it again.";
    case 'FirebaseError': return 'The AI service returned an error for this sheet. Try it again.';
    default: return e.message?.startsWith('AI/') ? 'The AI service returned an error for this sheet. Try it again.' : e.message || 'Something went wrong reading this sheet.';
  }
}
