// Reads queued sheets one by one: classify the image, read it on the right side, mark it in
// code, ask for a second read where needed, match the name to the roster, save.
import { classify, isSample, type SampleImage, type StudentImage } from '../ai/images';
import { readSampleSheet, readStudentSheet, rereadSampleQuestions, rereadStudentQuestions } from '../ai/tasks';
import { cancelQueued } from '../ai/queue';
import { markRead, mergeReread, rereadQuestions } from '../marking/pipeline';
import { matchName } from '../marking/roster';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';

export interface RunState { running: boolean; done: number; total: number; current?: string; avgMs: number; error?: string }
type Listener = (s: RunState) => void;
let state: RunState = { running: false, done: 0, total: 0, avgMs: 0 };
const listeners = new Set<Listener>();
let stopRequested = false;
const emit = (patch: Partial<RunState>) => { state = { ...state, ...patch }; listeners.forEach((l) => l(state)); };
export const runState = () => state;
export const onRun = (l: Listener) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function stopRun() { stopRequested = true; cancelQueued(); }

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

export async function runQuiz(cls: ClassRec, quiz: QuizRec, onSheet: (s: SheetRec) => void, limit = Infinity): Promise<void> {
  if (state.running) return;
  stopRequested = false;
  const queued = (await store.sheets(quiz.id)).filter((s) => s.status === 'queued' || s.status === 'error').slice(0, limit);
  emit({ running: true, done: 0, total: queued.length, avgMs: state.avgMs || 9000, error: undefined });
  const taken = new Set((await store.sheets(quiz.id)).map((s) => s.studentId).filter((x): x is string => !!x));
  let totalMs = 0;
  try {
    for (const sheet of queued) {
      if (stopRequested) break;
      emit({ current: sheet.fileName ?? sheet.sampleId ?? sheet.id });
      let s: SheetRec = { ...sheet, status: 'reading', error: undefined };
      await store.putSheet(s); onSheet(s);
      const t0 = performance.now();
      try {
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
      } catch (e) {
        s = { ...s, status: 'error', error: friendly(e as Error) };
      }
      totalMs += performance.now() - t0;
      await store.putSheet(s); onSheet(s);
      emit({ done: state.done + 1, avgMs: Math.round(totalMs / (state.done + 1)) });
      if (s.status === 'error' && /on-device|browser has no/.test(s.error ?? '')) { emit({ error: s.error }); break; }
    }
  } finally {
    emit({ running: false, current: undefined });
  }
}

export function friendly(e: Error): string {
  switch (e.name) {
    case 'DeviceUnavailable': return `${e.message} Student sheets are only ever read on this laptop, so Tickmark stopped instead of uploading.`;
    case 'GuardBlocked': return e.message;
    case 'OffDeviceAnswer': return e.message;
    case 'TimeoutError': return `${e.message}. Try this sheet again.`;
    case 'CancelledError': return 'Stopped.';
    case 'SyntaxError': return "The model's answer wasn't valid. Try this sheet again.";
    default: return e.message || 'Something went wrong reading this sheet.';
  }
}
