// Everything a teacher creates lives in this browser's IndexedDB. Nothing is synced anywhere.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Where, LedgerEvent } from '../ai/ledger';
import type { SheetRead, TotalsResponse } from '../ai/schemas';
import type { Marked, QuestionKey } from '../marking/mark';
import type { Student } from '../marking/roster';
import type { ClassTotals, GradeBand, Subject } from '../privacy/aggregate';

export interface ClassRec { id: string; name: string; roster: Student[]; createdAt: number; sample?: boolean }
export interface QuizRec {
  id: string; classId: string; title: string; keys: QuestionKey[];
  /** Credit for half-right answers (unsimplified fractions, a missing unit): 0, 0.5 or 1. */
  unsimplifiedCredit: number; createdAt: number;
  subject?: Subject; gradeBand?: GradeBand; extract?: string;
}
export type SheetStatus = 'queued' | 'reading' | 'read' | 'error' | 'checked';
export interface SheetRec {
  id: string; quizId: string; imageId?: string; imageSha?: string; source: 'photo' | 'typed' | 'sample'; sampleId?: string; fileName?: string;
  status: SheetStatus; studentId: string | null; nameConfident: boolean; readName: string;
  marks: Marked[]; read?: SheetRead; where?: Where; ms?: number; rereadQs?: number[]; rereadMs?: number; error?: string;
  createdAt: number; checkedAt?: number;
}
export interface PlanRec { quizId: string; at: number; payload: ClassTotals; response: TotalsResponse; where: Where; ms: number; heldBack?: string; note?: string; mode?: string; cloudTried?: boolean }

interface Schema extends DBSchema {
  classes: { key: string; value: ClassRec };
  quizzes: { key: string; value: QuizRec; indexes: { byClass: string } };
  sheets: { key: string; value: SheetRec; indexes: { byQuiz: string } };
  images: { key: string; value: { id: string; blob: Blob } };
  plans: { key: string; value: PlanRec };
  ledger: { key: string; value: LedgerEvent };
}

export const DB_NAME = 'tickmark';
let dbp: Promise<IDBPDatabase<Schema>> | null = null;

export function db() {
  if (!dbp) {
    dbp = openDB<Schema>(DB_NAME, 1, {
      // Another tab wants to erase or upgrade the database: let go so it can, then ask for a reload.
      blocking() { dbp?.then((d) => d.close()); dbp = null; window.dispatchEvent(new CustomEvent('tickmark:db-blocked')); },
      upgrade(d) {
        d.createObjectStore('classes', { keyPath: 'id' });
        d.createObjectStore('quizzes', { keyPath: 'id' }).createIndex('byClass', 'classId');
        d.createObjectStore('sheets', { keyPath: 'id' }).createIndex('byQuiz', 'quizId');
        d.createObjectStore('images', { keyPath: 'id' });
        d.createObjectStore('plans', { keyPath: 'quizId' });
        d.createObjectStore('ledger', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

export const uid = (p: string) => `${p}_${crypto.randomUUID().slice(0, 8)}`;

export const store = {
  async classes() { return (await (await db()).getAll('classes')).sort((a, b) => a.createdAt - b.createdAt); },
  async class(id: string) { return (await db()).get('classes', id); },
  async putClass(c: ClassRec) { await (await db()).put('classes', c); },
  async quizzes(classId: string) { return (await db()).getAllFromIndex('quizzes', 'byClass', classId); },
  async quiz(id: string) { return (await db()).get('quizzes', id); },
  async putQuiz(q: QuizRec) { await (await db()).put('quizzes', q); },
  async sheets(quizId: string) { return (await (await db()).getAllFromIndex('sheets', 'byQuiz', quizId)).sort((a, b) => a.createdAt - b.createdAt); },
  async putSheet(s: SheetRec) { await (await db()).put('sheets', s); },
  async deleteSheet(s: SheetRec) { const d = await db(); await d.delete('sheets', s.id); if (s.imageId) await d.delete('images', s.imageId); },
  async image(id: string) { return (await (await db()).get('images', id))?.blob; },
  async putImage(id: string, blob: Blob) { await (await db()).put('images', { id, blob }); },
  async plan(quizId: string) { return (await db()).get('plans', quizId); },
  async putPlan(p: PlanRec) { await (await db()).put('plans', p); },
  async ledger() { return (await db()).getAll('ledger'); },
  async putLedger(e: LedgerEvent) { await (await db()).put('ledger', e); },

  /** Deletes one class with its quizzes, sheets, photos and plans. */
  async deleteClass(classId: string) {
    const d = await db();
    for (const q of await d.getAllFromIndex('quizzes', 'byClass', classId)) {
      for (const s of await d.getAllFromIndex('sheets', 'byQuiz', q.id)) { await d.delete('sheets', s.id); if (s.imageId) await d.delete('images', s.imageId); }
      await d.delete('plans', q.id);
      await d.delete('quizzes', q.id);
    }
    await d.delete('classes', classId);
  },

  /** Deletes the stored photos of a quiz after review (marks are kept). */
  async deletePhotos(quizId: string) {
    const d = await db();
    for (const s of await d.getAllFromIndex('sheets', 'byQuiz', quizId)) {
      if (s.imageId) { await d.delete('images', s.imageId); await d.put('sheets', { ...s, imageId: undefined }); }
    }
  },

  /** Erases the whole database and local settings. */
  async eraseEverything() {
    if (dbp) { (await dbp).close(); dbp = null; }
    await new Promise<void>((res, rej) => {
      const r = indexedDB.deleteDatabase(DB_NAME);
      r.onsuccess = () => res();
      r.onerror = () => rej(r.error);
      r.onblocked = () => setTimeout(() => rej(new Error('Close the other Tickmark tabs to finish erasing.')), 3000);
    });
    try { localStorage.clear(); sessionStorage.clear(); } catch { /* ignore */ }
  },
};

export async function storageEstimate() {
  const est = await navigator.storage?.estimate?.();
  const persisted = await navigator.storage?.persisted?.();
  return { usedMB: est?.usage ? est.usage / 1048576 : 0, persisted: !!persisted };
}
