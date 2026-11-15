import { rosterTokens } from '../privacy/nameCheck';
// App start-up: sample fingerprints, recorded cloud readings, ledger persistence, settings.
import { setSampleHashes } from '../ai/images';
import { ledger } from '../ai/ledger';
import { setAllowedImageHashes, setRosterTokens } from '../ai/netGuard';
import { setRecorded, type Recorded } from '../ai/tasks';
import { setDeviceRecording, type DeviceRecording } from '../ai/deviceRecording';
import { loadRemoteSettings } from '../ai/firebase';
import type { QuestionKey } from '../marking/mark';
import type { QType } from '../marking/qtypes';
import type { GradeBand, Subject } from '../privacy/aggregate';
import { db, store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';

export interface SampleManifest {
  quiz: {
    title: string; className: string; subject: Subject; grade_band: GradeBand; instructions?: string; extract?: string;
    questions: { q: number; prompt: string; key: string; type?: QType; marks?: number; spellingCounts?: boolean; passage?: boolean }[];
  };
  students: { id: string; name: string; sha256: string; answers: { q: number; written: string; label: string; crossedOut: string; ref?: boolean[] | number[] }[] }[];
  generated: string;
}

/** The three made-up classes, in the order the welcome page shows them. */
export const SAMPLES = ['maths', 'science', 'english'] as const;
export type SampleKey = (typeof SAMPLES)[number];
export const sampleClassId = (k: SampleKey) => `sample-${k}`;
export const sampleQuizId = (k: SampleKey) => `sample-quiz-${k}`;
/** v1 links (#/quiz/sample-quiz) still open the maths class. */
export const SAMPLE_QUIZ_ID = sampleQuizId('maths');

const manifests = new Map<SampleKey, SampleManifest>();
const photoDir = new Map<string, SampleKey>(); // sample id -> class folder
export const sampleManifest = (k: SampleKey = 'maths') => manifests.get(k) ?? null;
export const sampleKeyOfQuiz = (quizId: string): SampleKey | null => SAMPLES.find((k) => sampleQuizId(k) === quizId) ?? null;
export const sampleKeyOfClass = (classId: string): SampleKey | null => SAMPLES.find((k) => sampleClassId(k) === classId) ?? null;
const photoVersion = new Map<string, string>(); // sample id -> first 8 hex of its SHA-256, so a changed photo is never served from cache
export const samplePhotoUrl = (sampleId: string) => `/samples/${photoDir.get(sampleId) ?? 'maths'}/${sampleId}.jpg${photoVersion.has(sampleId) ? `?v=${photoVersion.get(sampleId)}` : ''}`;
/** Every made-up name in every sample class (the guard's "test it yourself" uses them). */
export const sampleNames = () => [...manifests.values()].flatMap((m) => m.students.map((s) => s.name));

export let bootError: string | null = null;

export async function boot() {
  try { ledger.load(await store.ledger()); } catch { /* first run */ }
  ledger.setPersist((e) => { store.putLedger(e).catch(() => undefined); });
  loadRemoteSettings().catch(() => undefined);
  await requeueInterrupted().catch(() => undefined);
  try {
    await Promise.all(SAMPLES.map(async (k) => {
      const r = await fetch(`/samples/${k}/manifest.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      manifests.set(k, (await r.json()) as SampleManifest);
    }));
    bootError = null;
  } catch (e) {
    bootError = `The sample classes couldn't load (${(e as Error).message}). Check the connection and reload.`;
    return;
  }
  const hashes = new Map<string, string>();
  for (const [k, m] of manifests) for (const s of m.students) { hashes.set(s.sha256, s.id); photoDir.set(s.id, k); photoVersion.set(s.id, s.sha256.slice(0, 8)); }
  setSampleHashes(hashes);
  setAllowedImageHashes(hashes.keys());
  await Promise.all(SAMPLES.map(async (k) => {
    try {
      const r = await fetch(`/samples/${k}/recorded-cloud.json`);
      if (r.ok) setRecorded(k, (await r.json()) as Recorded);
    } catch { /* optional */ }
    try {
      const r = await fetch(`/samples/${k}/recorded-device.json`);
      if (r.ok) setDeviceRecording(k, (await r.json()) as DeviceRecording);
    } catch { /* optional */ }
  }));
  for (const k of SAMPLES) await ensureSampleClass(k);
  await dropV1Sample();
}

/** A reload or crash mid-run leaves sheets marked "reading". At start-up nothing is running, so queue them again. */
export async function requeueInterrupted() {
  const d = await db();
  const tx = d.transaction('sheets', 'readwrite');
  for (const s of await tx.store.getAll()) if (s.status === 'reading') await tx.store.put({ ...s, status: 'queued' });
  await tx.done;
}

/** v1 kept one sample class under fixed ids; v2 replaces it with the three classes. */
async function dropV1Sample() {
  if (await store.class('sample-class')) await store.deleteClass('sample-class');
}

export const keysFromManifest = (m: SampleManifest): QuestionKey[] =>
  m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key, ...(q.type ? { type: q.type } : {}), ...(q.marks ? { marks: q.marks } : {}), ...(q.spellingCounts ? { spellingCounts: true } : {}) }));

export async function ensureSampleClass(k: SampleKey, reset = false) {
  const m = manifests.get(k);
  if (!m) return;
  const id = sampleClassId(k);
  const existing = await store.class(id);
  if (existing && !reset) return;
  if (existing) await store.deleteClass(id);
  const cls: ClassRec = {
    id, name: m.quiz.className, sample: true, createdAt: SAMPLES.indexOf(k),
    roster: m.students.map((s) => ({ id: s.id, name: s.name })),
  };
  const quiz: QuizRec = {
    id: sampleQuizId(k), classId: cls.id, title: m.quiz.title, keys: keysFromManifest(m), unsimplifiedCredit: 0.5, createdAt: 0,
    subject: m.quiz.subject, gradeBand: m.quiz.grade_band, extract: m.quiz.extract,
  };
  await store.putClass(cls);
  await store.putQuiz(quiz);
  let t = 1;
  for (const s of m.students) {
    const sheet: SheetRec = {
      id: `sample-${s.id}`, quizId: quiz.id, source: 'sample', sampleId: s.id, fileName: `${s.id}.jpg`, status: 'queued',
      studentId: null, nameConfident: false, readName: '', marks: [], createdAt: t++,
    };
    await store.putSheet(sheet);
  }
}

/**
 * The network guard checks every request against the class lists of all your own classes, plus the class
 * on screen (round 6, R6-S2): a plan still queued for class A is checked against A even after you open B.
 * Made-up classes' invented names are added only while one is open, so they never block your own plans.
 */
export async function refreshGuardRoster(current?: { roster: { name: string }[]; sample?: boolean }) {
  const own = (await store.classes()).filter((c) => !c.sample);
  setRosterTokens(rosterTokens([...own, ...(current?.sample ? [current] : [])].flatMap((c) => c.roster.map((s) => s.name))));
}
