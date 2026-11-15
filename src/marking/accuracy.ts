// Reading accuracy of the sample class against the generator's ground truth (the same logic as
// tools/bench.js), so the app can show judges a measured number for the run they just did.
import { normalize } from './fraction';
import type { Marked } from './mark';

export interface Truth { id: string; answers: { q: number; written: string }[] }
export interface SheetLike { sampleId?: string; where?: string; marks: Marked[] }
export interface Accuracy { sheets: number; answers: number; exact: number; misread: number; flaggedMisreads: number; unflagged: number; flagged: number }

// case and a trailing full stop don't change a mark, so they don't count as misreads
const norm = (s: string) => normalize(s ?? '').replace(/\s*\/\s*/g, '/').replace(/\s*([=°%])\s*/g, '$1').toLowerCase().replace(/[.!]+$/, '');

export interface OpenTruth { id: string; answers: { q: number; written: string; ref?: boolean[] | number[] }[] }
export interface OpenAccuracy { answers: number; chars: number; charErrors: number; suggested: number; agree: number; within1: number; refTotal: number }

const lev = (a: string, b: string) => {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
};
const words = (s: string) => (s ?? '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Open answers on the sample: how close the reading was (character error rate, before any teacher
 * edit) and how often Gemini Nano's suggested mark equalled the author's reference mark.
 */
export function openAccuracy(sheets: SheetLike[], truth: OpenTruth[], refPoints: (q: number, ref: boolean[] | number[]) => number | null): OpenAccuracy {
  const byId = new Map(truth.map((t) => [t.id, t]));
  const o: OpenAccuracy = { answers: 0, chars: 0, charErrors: 0, suggested: 0, agree: 0, within1: 0, refTotal: 0 };
  for (const s of sheets) {
    const t = s.sampleId ? byId.get(s.sampleId) : undefined;
    if (!t) continue;
    for (const m of s.marks) {
      if (m.type !== 'short' && m.type !== 'passage') continue;
      const want = t.answers.find((x) => x.q === m.q);
      if (!want?.written) continue;
      const a = words(want.written), b = words(m.modelRead ?? m.read);
      o.answers++; o.chars += a.length; o.charErrors += lev(a, b);
      const ref = want.ref ? refPoints(m.q, want.ref) : null;
      if (ref === null) continue;
      o.refTotal++;
      if (!m.suggestion) continue;
      o.suggested++;
      if (Math.abs(m.suggestion.points - ref) < 0.01) o.agree++;
      if (Math.abs(m.suggestion.points - ref) <= 1) o.within1++;
    }
  }
  return o;
}

export function accuracy(sheets: SheetLike[], truth: Truth[], onlyExact = false): Accuracy {
  const byId = new Map(truth.map((t) => [t.id, t]));
  const a: Accuracy = { sheets: 0, answers: 0, exact: 0, misread: 0, flaggedMisreads: 0, unflagged: 0, flagged: 0 };
  for (const s of sheets) {
    const t = s.sampleId ? byId.get(s.sampleId) : undefined;
    if (!t) continue;
    a.sheets++;
    for (const m of s.marks) {
      if (onlyExact && (m.type === 'short' || m.type === 'passage')) continue;
      const want = t.answers.find((x) => x.q === m.q)?.written ?? '';
      // judge the model's own reading and flags, before any teacher change
      const flagged = m.modelFlagged ?? (m.flags.some((f) => f !== 'teacher_changed') || m.status === 'unreadable');
      const read = m.modelRead ?? m.read;
      a.answers++;
      if (flagged) a.flagged++;
      if (norm(read) === norm(want)) a.exact++;
      else { a.misread++; if (flagged) a.flaggedMisreads++; else a.unflagged++; }
    }
  }
  return a;
}
