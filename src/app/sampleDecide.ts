// Made-up classes only (round 5, J5): decide every waiting mark the way the class's own answer key says,
// so a judge can reach the results, the plan and the parent notes without making 50+ decisions by hand.
// A real class never gets this: "you decide every pencil mark" stays true for pupils' work.
import type { QuestionKey, Marked } from '../marking/mark';
import { typeOf } from '../marking/mark';
import { decideOpen } from '../marking/open';
import { applyCorrection, needsCheck } from '../marking/pipeline';
import { parseRubric } from '../marking/qtypes';
import type { ClassRec, SheetRec } from '../store/db';

export interface SampleTruth { id: string; answers: { q: number; written: string; ref?: boolean[] | number[] }[] }

const same = (a: string, b: string) => a.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim() === b.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();

/** One mark decided from the made-up pupil's real answer. Undecidable marks are returned unchanged. */
export function decideMark(key: QuestionKey, m: Marked, truth: { written: string; ref?: boolean[] | number[] } | undefined): Marked {
  if (!truth || !needsCheck(m)) return m;
  const type = typeOf(key);
  let out: Marked = m;
  if (type === 'short' || type === 'passage') {
    // the reading the teacher would have corrected first, then the mark from the author's reference
    const base = !same(m.read, truth.written) ? applyCorrection(key, m, truth.written) : m;
    if (!truth.written.trim()) out = { ...base, status: 'blank', checked: true };
    else if (type === 'short' && Array.isArray(truth.ref)) out = decideOpen(key, base, { met: (truth.ref as boolean[]).map(Boolean) });
    else if (type === 'passage' && Array.isArray(truth.ref)) {
      const rubric = parseRubric(key.answer) ?? [];
      out = decideOpen(key, base, { lines: rubric.map((r, i) => ({ score: Math.max(0, Math.min(r.max, Number((truth.ref as number[])[i]) || 0)), max: r.max })) });
    } else return m;
  } else {
    out = same(m.read, truth.written) && m.status !== 'unreadable' ? { ...m, checked: true } : applyCorrection(key, m, truth.written);
    if (needsCheck(out)) out = { ...out, checked: true };
  }
  return { ...out, decidedBy: 'sample_key' };
}

/** Every sheet of a made-up class decided from its answer key; names confirmed. Refuses a real class. */
export function decideFromKey(cls: ClassRec, keys: QuestionKey[], sheets: SheetRec[], truth: SampleTruth[]): SheetRec[] {
  if (!cls.sample) throw new Error('Only a made-up class can be decided from its answer key.');
  const byId = new Map(truth.map((t) => [t.id, t]));
  return sheets.map((s) => {
    const t = s.sampleId ? byId.get(s.sampleId) : undefined;
    if (!t) return s;
    const marks = s.marks.map((m) => { const k = keys.find((x) => x.q === m.q); return k ? decideMark(k, m, t.answers.find((a) => a.q === m.q)) : m; });
    return { ...s, marks, studentId: t.id, nameConfident: true, status: 'checked' as const, checkedAt: Date.now() };
  });
}
