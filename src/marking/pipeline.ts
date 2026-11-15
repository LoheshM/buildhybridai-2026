// Turns a model reading (plus an optional second read) into marks and flags. Pure, testable.
import { parse, normalize } from './fraction';
import { markAnswer, needsReread, type Marked, type QuestionKey } from './mark';

export interface FirstRead { answers: { q: number; crossedOutText: string; finalAnswer: string }[] }

export function markRead(keys: QuestionKey[], read: FirstRead): Marked[] {
  return keys.map((k) => {
    const a = read.answers.find((x) => x.q === k.q);
    const raw = a?.finalAnswer ?? '';
    const cleaned = stripPrinted(raw, k.prompt);
    const m = markAnswer(k, cleaned, a?.crossedOutText ?? '');
    // the model copied printed text into the answer: removed by code, and the teacher is asked to look
    return cleaned !== raw.trim() ? { ...m, flags: [...new Set([...m.flags, 'check_reading' as const])] } : m;
  });
}

const tokens = (s: string) => (s ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}/.%° ]+/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * Day-1 probe: Gemini Nano sometimes starts an answer with the printed question ("Why do plants
 * need light? They need light to make food."). If the answer opens with most of the printed
 * question, that part is removed. Exported for tests.
 */
export function stripPrinted(answer: string, prompt: string): string {
  const a = (answer ?? '').trim();
  const p = tokens(prompt).filter((t) => !/^[a-h]\)?$/.test(t)); // option letters alone don't count
  if (p.length < 3 || !a) return a;
  const words = a.split(/\s+/);
  // the answer must open with the printed question's own opening, in order (one word may be skipped
  // or misread); a pupil re-using a few of the question's words does not match
  let j = 0, cut = 0, hits = 0, misses = 0;
  for (let i = 0; i < words.length && j < p.length; i++) {
    const t = tokens(words[i]);
    if (!t.length) { cut = i + 1; continue; }
    if (t.every((x, n) => p[j + n] === x)) { j += t.length; hits += t.length; cut = i + 1; }
    else if (p[j + 1] !== undefined && t[0] === p[j + 1]) { j += 2; hits++; cut = i + 1; misses++; }
    else if (hits > 0 && misses === 0) { j++; misses++; cut = i + 1; }
    else break;
    if (misses > 1) return a;
  }
  if (hits < Math.max(3, Math.ceil(p.length * 0.6))) return a;
  const rest = words.slice(cut).join(' ').replace(/^[\s:;,.?!=-]+/, '');
  return rest;
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
export function mergeReread(marks: Marked[], second: Map<number, string | { final: string; crossed: string }>, keys: QuestionKey[] = []): Marked[] {
  return marks.map((m) => {
    if (!second.has(m.q)) return m;
    const got = second.get(m.q)!;
    const alt = typeof got === 'string' ? got : got.final;
    const secondCrossed = typeof got === 'string' ? undefined : got.crossed;
    // Agreement: a second read that ignores crossed-out work found the same answer, so "crossed-out work"
    // is a note, not a flag (Nano often reports crossed-out text that isn't there). A swapped final and
    // crossed-out answer would make the two reads disagree, which keeps the flag where it matters.
    if (sameValue(alt, m.read)) {
      // Clear the crossed-out flag only if reading the crossed-out text as the answer would give the
      // same mark: then even a swap by both reads can't change the score.
      // The flag becomes a note when the second read sees no crossed-out work (the first read imagined
      // it), or when reading the crossed-out text as the answer would give the same mark anyway.
      // If both reads see crossed-out work and a swap could change the mark, the teacher checks it.
      const key = keys.find((k) => k.q === m.q);
      const imagined = secondCrossed !== undefined && secondCrossed.trim() === '';
      const swapSafe = !!key && !!m.crossedOut && (parse(m.crossedOut).kind !== 'value' || markAnswer(key, m.crossedOut).status === m.status);
      return m.flags.includes('crossed_out') && (imagined || swapSafe) ? { ...m, flags: m.flags.filter((f) => f !== 'crossed_out') } : m;
    }
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
  // an open answer whose reading changed waits for the teacher's mark (the old suggestion was for other words)
  if (m.status === 'pending') return { ...m, flags: changed ? ['teacher_changed'] : [], suggestions: [], checked: false };
  return { ...m, flags: changed ? ['teacher_changed'] : [], suggestions: changed && before.read.trim() ? [before.read] : [], checked: true };
}

/** The teacher decides an unreadable answer is wrong: their decision, not the model's. */
export function markWrongByTeacher(before: Marked): Marked {
  return { ...before, status: 'wrong', misconception: null, flags: ['teacher_changed'], checked: true };
}

/** Flags still waiting for the teacher. */
export const openFlags = (m: Marked) => (m.checked ? [] : m.flags.filter((f) => f !== 'teacher_changed'));
/** An answer waits for the teacher while it has open flags or is still unreadable. */
export const needsCheck = (m: Marked) => ((m.status === 'unreadable' || m.status === 'pending') && !m.checked) || openFlags(m).length > 0;

/** Stamps the model's reading onto each mark after the second read, before any teacher change. */
export const stampModelRead = (marks: Marked[]): Marked[] => marks.map((m) => ({ ...m, modelRead: m.read, modelFlagged: needsCheck(m) }));
