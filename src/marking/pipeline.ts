// Turns a model reading (plus an optional second read) into marks and flags. Pure, testable.
import { parse, eq } from './fraction';
import { markAnswer, needsReread, type Marked, type QuestionKey } from './mark';

export interface FirstRead { answers: { q: number; crossedOutText: string; finalAnswer: string }[] }

export function markRead(keys: QuestionKey[], read: FirstRead): Marked[] {
  return keys.map((k) => {
    const a = read.answers.find((x) => x.q === k.q);
    return markAnswer(k, a?.finalAnswer ?? '', a?.crossedOutText ?? '');
  });
}

export function rereadQuestions(keys: QuestionKey[], marks: Marked[]): number[] {
  return keys.filter((k) => { const m = marks.find((x) => x.q === k.q); return m ? needsReread(k, m) : false; }).map((k) => k.q);
}

const sameValue = (a: string, b: string) => {
  const pa = parse(a), pb = parse(b);
  if (pa.kind === 'blank' && pb.kind === 'blank') return true;
  if (pa.kind === 'value' && pb.kind === 'value') return eq(pa.value, pb.value) && pa.form === pb.form;
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
};

/**
 * Merges the second read. Agreement keeps the mark. Disagreement keeps the first reading,
 * adds a "Second read disagreed" flag and offers the second reading as a one-tap fix.
 * The model's second opinion is never applied silently, so it can never turn a wrong into a right.
 */
export function mergeReread(marks: Marked[], second: Map<number, string>): Marked[] {
  return marks.map((m) => {
    if (!second.has(m.q)) return m;
    const alt = second.get(m.q)!;
    if (sameValue(alt, m.read)) return m;
    // Only offer readings that are a single clean value; garbage like "/2 1/2" is never a one-tap fix.
    const usable = parse(alt).kind === 'value' || parse(alt).kind === 'blank';
    return { ...m, flags: [...new Set([...m.flags, 'reread_disagreed' as const])], suggestions: usable ? [...new Set([alt, ...m.suggestions])].filter((s) => s !== m.read) : m.suggestions };
  });
}

/** Applies a teacher's correction: re-marks the answer from the corrected reading. */
export function applyCorrection(key: QuestionKey, before: Marked, corrected: string): Marked {
  const m = markAnswer(key, corrected, '');
  const changed = before.read.replace(/\s+/g, ' ').trim() !== corrected.replace(/\s+/g, ' ').trim();
  return { ...m, flags: changed ? ['teacher_changed'] : [], suggestions: changed ? [before.read] : [], checked: true };
}

/** Flags still waiting for the teacher. */
export const openFlags = (m: Marked) => (m.checked ? [] : m.flags.filter((f) => f !== 'teacher_changed'));
export const needsCheck = (m: Marked) => openFlags(m).length > 0;
