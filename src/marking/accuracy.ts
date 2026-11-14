// Reading accuracy of the sample class against the generator's ground truth (the same logic as
// tools/bench.js), so the app can show judges a measured number for the run they just did.
import { normalize } from './fraction';
import type { Marked } from './mark';

export interface Truth { id: string; answers: { q: number; written: string }[] }
export interface SheetLike { sampleId?: string; where?: string; marks: Marked[] }
export interface Accuracy { sheets: number; answers: number; exact: number; misread: number; flaggedMisreads: number; unflagged: number; flagged: number }

const norm = (s: string) => normalize(s ?? '').replace(/\s*\/\s*/g, '/');

export function accuracy(sheets: SheetLike[], truth: Truth[]): Accuracy {
  const byId = new Map(truth.map((t) => [t.id, t]));
  const a: Accuracy = { sheets: 0, answers: 0, exact: 0, misread: 0, flaggedMisreads: 0, unflagged: 0, flagged: 0 };
  for (const s of sheets) {
    const t = s.sampleId ? byId.get(s.sampleId) : undefined;
    if (!t) continue;
    a.sheets++;
    for (const m of s.marks) {
      const want = t.answers.find((x) => x.q === m.q)?.written ?? '';
      const flagged = m.flags.some((f) => f !== 'teacher_changed') || m.status === 'unreadable';
      a.answers++;
      if (flagged) a.flagged++;
      // judge the model's reading, before any teacher correction
      const read = m.flags.includes('teacher_changed') && m.suggestions[0] !== undefined ? m.suggestions[0] : m.read;
      if (norm(read) === norm(want)) a.exact++;
      else { a.misread++; if (flagged || m.flags.includes('teacher_changed')) a.flaggedMisreads++; else a.unflagged++; }
    }
  }
  return a;
}
