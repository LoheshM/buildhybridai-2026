// Reads queued sheets one by one: classify the image, read it on the right side, mark it in
// code, ask for a second read where needed, match the name to the roster, save.
// The runner lives at module level, so a run keeps going while the teacher moves between pages.
import { classify, isSample, type SampleImage, type StudentImage } from '../ai/images';
import { noteSampleDeviceFailure, noteSampleDeviceSuccess, readSampleSheet, readStrip, rereadStrip, resetLiveSampleReads, sampleDeviceUsable, suggestOpen, type ReadResult } from '../ai/tasks';
import { CancelledError } from '../ai/queue';
import { cutAnswerSheet } from '../img/crop';
import { cancelQueued } from '../ai/queue';
import { resetAllModels } from '../ai/models';
import { markRead, mergeReread, rereadQuestions, stampModelRead } from '../marking/pipeline';
import { matchName } from '../marking/roster';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { samplePhotoUrl } from './boot';

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

export function stopRun() { stopRequested = true; cancelQueued(); resetAllModels(); }

class OutOfSpace extends Error { constructor() { super('This browser is out of storage space. Delete the photos of quizzes you have already checked (Results page), then try again.'); this.name = 'OutOfSpace'; } }

async function save(s: SheetRec) {
  try { await store.putSheet(s); }
  catch (e) { if ((e as Error).name === 'QuotaExceededError') throw new OutOfSpace(); throw e; }
  sheetListeners.forEach((l) => l(s));
}

async function imageFor(sheet: SheetRec): Promise<Blob> {
  if (sheet.source === 'sample' && sheet.sampleId) {
    const r = await fetch(samplePhotoUrl(sheet.sampleId));
    if (!r.ok) throw new Error('Sample photo missing');
    return r.blob();
  }
  const b = sheet.imageId ? await store.image(sheet.imageId) : undefined;
  if (!b) throw new Error('Photo not found (it may have been deleted).');
  return b;
}

const RETRYABLE = new Set(['TimeoutError', 'SyntaxError', 'AbortError']);
const STOPS_BATCH = new Set(['DeviceUnavailable', 'GuardBlocked', 'OffDeviceAnswer', 'OutOfSpace']);
// NoMarkers (corner squares not found) fails only that sheet: the teacher retakes its photo

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
    emit({ total: queued.length, avgMs: 0 }); // no estimate until real sheets are timed
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
          const photo = await imageFor(sheet);
          const img = await classify(photo);
          if (sheet.source === 'sample' && !isSample(img)) throw new Error('Sample photo does not match its fingerprint; refusing to send it anywhere.');
          const sample = isSample(img);
          let first: ReadResult;
          let strip: StudentImage | null = null;
          // Code, on this laptop, for every sheet: find the answer boxes, keep each box's handwriting, decide which are empty.
          const cut = await cutAnswerSheet(photo, quiz.keys);
          const cutMs = cut.ms;
          const crops: Record<number, string> = {};
          for (const [q, blob] of cut.crops) { const id = `${sheet.id}#q${q}`; await store.putImage(id, blob); crops[q] = id; }
          // Every answer box empty: an upside-down photo or another quiz's sheet lands every box on bare paper.
          // That is never scored as a zero (round 5, E15).
          if (quiz.keys.length > 0 && cut.blank.length >= quiz.keys.length) throw new NoWriting();
          if (!sample || (await sampleDeviceUsable())) {
            // Gemini Nano reads the boxes with writing in them, as one strip, on this laptop.
            strip = (await classify(cut.strip)) as StudentImage; // a strip never matches a sample fingerprint: it can only be read on-device
            try {
              first = await readStrip(strip, quiz.keys, cut.blank, sample ? 'sample' : 'student');
              if (sample) noteSampleDeviceSuccess();
            } catch (e) {
              if (!sample || e instanceof CancelledError || (e as Error).name === 'AbortError') throw e;
              noteSampleDeviceFailure(); // made-up sheets only: fall back to the cloud path below
              strip = null;
              first = await readSampleSheet(img as SampleImage, quiz.keys);
            }
          } else {
            first = await readSampleSheet(img as SampleImage, quiz.keys);
          }
          // an empty box is empty, whatever any model says about it
          for (const a of first.read.answers) if (cut.blank.includes(a.q)) { a.finalAnswer = ''; a.crossedOutText = ''; }
          let marks = markRead(quiz.keys, first.read);
          const qs = rereadQuestions(quiz.keys, marks);
          let rereadMs: number | undefined;
          if (qs.length && strip && first.where === 'on_device') {
            const second = await rereadStrip(strip, qs, quiz.keys, sample ? 'sample' : 'student');
            marks = mergeReread(marks, second.answers, quiz.keys); rereadMs = second.ms;
          }
          // a box with ink in it that came back empty was not read, whatever the model says: the teacher looks
          marks = marks.map((m) => (!m.read.trim() && !cut.blank.includes(m.q) ? { ...m, status: 'unreadable' as const, flags: [...new Set([...m.flags, 'unreadable' as const])] } : m));
          marks = stampModelRead(marks);
          // Open answers: Gemini Nano suggests a mark from the text it read; the teacher decides.
          for (let i = 0; i < marks.length; i++) {
            if (marks[i].status !== 'pending' || stopRequested) continue;
            const key = quiz.keys.find((k) => k.q === marks[i].q)!;
            const sug = await suggestOpen(marks[i].read, key, sample ? { sample: (img as SampleImage).sampleId, deviceOnly: !!strip } : { student: true });
            if (sug) marks[i] = { ...marks[i], suggestion: sug };
          }
          const match = matchName(first.read.studentName, cls.roster, taken);
          if (match.studentId) taken.add(match.studentId);
          s = { ...s, status: 'read', read: first.read, readName: first.read.studentName, studentId: match.studentId, nameConfident: match.confident, marks, where: first.where, ms: first.ms + cutMs, rereadQs: rereadMs !== undefined ? qs : undefined, rereadMs, crops };
          break;
        } catch (e) {
          lastErr = e as Error;
          if (!RETRYABLE.has(lastErr.name)) break; // a hung or garbled answer gets one automatic retry
        }
      }
      const stopped = !!lastErr && (lastErr.name === 'CancelledError' || (stopRequested && lastErr.name === 'AbortError'));
      if (lastErr) s = { ...s, status: stopped ? 'queued' : 'error', error: stopped ? undefined : friendly(lastErr) };
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

/** No ink in any answer box. */
export class NoWriting extends Error {
  constructor() { super("No writing found in any answer box. If the photo is upside down or of another quiz's answer sheet, retake it. A sheet the pupil left blank can be typed in as blanks."); this.name = 'NoWriting'; }
}

export function friendly(e: Error): string {
  switch (e.name) {
    case 'DeviceUnavailable': return (e as Error & { state?: string }).state === 'not_responding' ? 'The on-device model stopped responding. Reload the page (Ctrl+R), then click Read the rest: your sheets so far are saved.' : `${e.message} Student sheets are only ever read on this laptop, so Tickmark stopped instead of uploading.`;
    case 'GuardBlocked': case 'OffDeviceAnswer': case 'OutOfSpace': return e.message;
    case 'TimeoutError': return `${e.message}. Try this sheet again.`;
    case 'CancelledError': return 'Stopped.';
    case 'SyntaxError': return "The AI's answer for this sheet wasn't readable. Try it again.";
    case 'FirebaseError': return 'The AI service returned an error for this sheet. Try it again.';
    default: return e.message?.startsWith('AI/') ? 'The AI service returned an error for this sheet. Try it again.' : e.message || 'Something went wrong reading this sheet.';
  }
}
