// Turns a model reading (plus an optional second read) into marks and flags. Pure, testable.
import { parse, normalize } from './fraction';
import { markAnswer, needsReread, type Marked, type QuestionKey } from './mark';

export interface FirstRead { answers: { q: number; crossedOutText: string; finalAnswer: string }[] }

export function markRead(keys: QuestionKey[], read: FirstRead): Marked[] {
  return keys.map((k) => {
    const a = read.answers.find((x) => x.q === k.q);
    return markAnswer(k, a?.finalAnswer ?? '', a?.crossedOutText ?? '');
  });
}

export function rereadQuestions(keys: QuestionKey[], marks: Marked[]): number[] {
  // Blanks get a second look only on sheets with some writing (an empty sheet stays empty).
  const anyWritten = marks.some((m) => m.status !== 'blank');
  return keys.filter((k) => {
    const m = marks.find((x) => x.q === k.q);
    if (!m) return false;
    if (m.status === 'blank') return anyWritten;
    return needsReread(k, m);
  }).map((k) => k.q);
}

/** A second read agrees only when it reads the same written answer (2 2/8 and 2 1/4 are marked differently). */
const sameValue = (a: string, b: string) => normalize(a) === normalize(b);

/**
 * Merges the second read. Agreement keeps the mark. Disagreement keeps the first reading,
 * adds a "Second read disagreed" flag and offers the second reading as a one-tap fix.
 * The model's second opinion is never applied silently, so it can never turn a wrong into a right.
 */
export function mergeReread(marks: Marked[], second: Map<number, string>): Marked[] {
  return marks.map((m) => {
    if (!second.has(m.q)) return m;
    const alt = second.get(m.q)!;
    // Agreement: a second read that ignores crossed-out work found the same answer, so "crossed-out work"
    // is a note, not a flag (Nano often reports crossed-out text that isn't there). A swapped final and
    // crossed-out answer would make the two reads disagree, which keeps the flag where it matters.
    if (sameValue(alt, m.read)) return m.flags.includes('crossed_out') && (m.status === 'correct' || m.status === 'unsimplified') ? { ...m, flags: m.flags.filter((f) => f !== 'crossed_out') } : m;
    // Only offer readings that are a single clean value; garbage like "/2 1/2" is never a one-tap fix.
    const pa = parse(alt);
    // "1 1/2" read from a crossed-out "1/2" next to "1/2" is not a reading worth offering
    const glued = !!m.crossedOut && pa.kind === 'value' && pa.form === 'mixed' && !m.suggestions.includes(alt);
    const usable = pa.kind === 'value' && !glued;
    return { ...m, flags: [...new Set([...m.flags, 'reread_disagreed' as const])], suggestions: usable ? [...new Set([alt, ...m.suggestions])].filter((s) => s !== m.read) : m.suggestions };
  });
}

/** Applies a teacher's correction: re-marks the answer from the corrected reading. */
export function applyCorrection(key: QuestionKey, before: Marked, corrected: string): Marked {
  const m = { ...markAnswer(key, corrected, ''), modelRead: before.modelRead, modelFlagged: before.modelFlagged };
  const changed = before.read.replace(/\s+/g, ' ').trim() !== corrected.replace(/\s+/g, ' ').trim();
  // Still unreadable (e.g. two answers typed back): keep it open for the teacher.
  if (m.status === 'unreadable') return { ...m, checked: false };
  return { ...m, flags: changed ? ['teacher_changed'] : [], suggestions: changed && before.read.trim() ? [before.read] : [], checked: true };
}

/** The teacher decides an unreadable answer is wrong: their decision, not the model's. */
export function markWrongByTeacher(before: Marked): Marked {
  return { ...before, status: 'wrong', misconception: null, flags: ['teacher_changed'], checked: true };
}

/** Flags still waiting for the teacher. */
export const openFlags = (m: Marked) => (m.checked ? [] : m.flags.filter((f) => f !== 'teacher_changed'));
/** An answer waits for the teacher while it has open flags or is still unreadable. */
export const needsCheck = (m: Marked) => (m.status === 'unreadable' && !m.checked) || openFlags(m).length > 0;

/** Stamps the model's reading onto each mark after the second read, before any teacher change. */
export const stampModelRead = (marks: Marked[]): Marked[] => marks.map((m) => ({ ...m, modelRead: m.read, modelFlagged: needsCheck(m) }));
