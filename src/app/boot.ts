// App start-up: sample fingerprints, recorded cloud readings, ledger persistence, settings.
import { setSampleHashes } from '../ai/images';
import { ledger } from '../ai/ledger';
import { setAllowedImageHashes } from '../ai/netGuard';
import { setRecorded, type Recorded } from '../ai/tasks';
import { loadRemoteSettings } from '../ai/firebase';
import type { QuestionKey } from '../marking/mark';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';

export interface SampleManifest {
  quiz: { title: string; className: string; questions: { q: number; prompt: string; key: string }[] };
  students: { id: string; name: string; sha256: string; answers: { q: number; written: string; label: string; crossedOut: string }[] }[];
  generated: string;
}

let manifest: SampleManifest | null = null;
export const sampleManifest = () => manifest;
export const SAMPLE_CLASS_ID = 'sample-class';
export const SAMPLE_QUIZ_ID = 'sample-quiz';

export async function boot() {
  const m = (await (await fetch('/samples/manifest.json')).json()) as SampleManifest;
  manifest = m;
  const map = new Map(m.students.map((s) => [s.sha256, s.id]));
  setSampleHashes(map);
  setAllowedImageHashes(map.keys());
  try {
    const r = await fetch('/samples/recorded-cloud.json');
    if (r.ok) setRecorded((await r.json()) as Recorded);
  } catch { /* optional */ }
  try { ledger.load(await store.ledger()); } catch { /* first run */ }
  ledger.setPersist((e) => { store.putLedger(e).catch(() => undefined); });
  navigator.storage?.persist?.().catch(() => undefined);
  loadRemoteSettings().catch(() => undefined);
  await ensureSampleClass();
}

export async function ensureSampleClass(reset = false) {
  if (!manifest) return;
  const existing = await store.class(SAMPLE_CLASS_ID);
  if (existing && !reset) return;
  if (existing) await store.deleteClass(SAMPLE_CLASS_ID);
  const cls: ClassRec = {
    id: SAMPLE_CLASS_ID, name: `Sample: ${manifest.quiz.className}`, sample: true, createdAt: 0,
    roster: manifest.students.map((s) => ({ id: s.id, name: s.name })),
  };
  const keys: QuestionKey[] = manifest.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
  const quiz: QuizRec = { id: SAMPLE_QUIZ_ID, classId: cls.id, title: manifest.quiz.title, keys, unsimplifiedCredit: 0.5, createdAt: 0 };
  await store.putClass(cls);
  await store.putQuiz(quiz);
  let t = 1;
  for (const s of manifest.students) {
    const sheet: SheetRec = {
      id: `sample-${s.id}`, quizId: quiz.id, source: 'sample', sampleId: s.id, fileName: `${s.id}.jpg`, status: 'queued',
      studentId: null, nameConfident: false, readName: '', marks: [], createdAt: t++,
    };
    await store.putSheet(sheet);
  }
}
