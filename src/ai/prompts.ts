// Prompts are versioned so measured accuracy can be tied to the exact wording.
import type { ClassTotals } from '../privacy/aggregate';
import { MISCONCEPTIONS } from '../marking/misconceptions';
import { fold } from '../marking/roster';

export const PROMPTS_VERSION = 'r1-2026-11-16';

export const readSheetPrompt = (questionCount: number) =>
  `This is a photo of a student's maths worksheet with ${questionCount} numbered questions. ` +
  `For each question number 1-${questionCount}: put any answer the student struck through with a line in crossedOutText (empty string if none), ` +
  `and put the remaining handwritten answer in finalAnswer exactly as written (use "a/b" for fractions, and "w a/b" with a space for mixed numbers, empty string if blank). ` +
  `Do not correct mistakes. Also copy the handwritten student name.`;

export const rereadPrompt = (qs: number[]) =>
  `This is a photo of a student's maths worksheet. Look carefully at questions ${qs.join(', ')} only. ` +
  `For each of them, copy the student's final handwritten answer to the right of the "=" sign exactly as written. ` +
  `If a whole number is written to the left of a fraction, include it with a space, for example "1 1/2". ` +
  `If an answer has a line through it, it is crossed out: ignore it and use the other answer. Use an empty string if there is no answer.`;

/** compact: the on-device variant (Gemini Nano writes far fewer tokens per second than the cloud). */
export const totalsPrompt = (t: ClassTotals, compact = false) =>
  `You are helping a maths teacher (students aged 9-14) plan tomorrow's lesson. Below are ANONYMOUS class totals from a fractions check: ` +
  `no student names or individual answers. "mistakes" counts wrong answers by the mistake pattern a marking program detected ` +
  `(add_across = added tops and bottoms straight across; numerators_only = combined numerators but kept one denominator; ` +
  `denominators_multiplied; whole_dropped = lost the whole number of a mixed number; cross_multiply; no_invert = divided without flipping; ` +
  `flipped_first; reversed_subtraction; wrong_operation; slip = arithmetic slip; other = unexplained). A value of "hidden" is a small group hidden for privacy (or a number that would reveal one); treat it as "a few".\n\n` +
  `Write:\n` +
  `1. plan: a reteach mini-lesson of at most 15 minutes aimed at the most common mistake pattern, with ${compact ? '3 short' : '3-5'} steps (each with one full sentence for what the teacher does and one for what students do), ` +
  `a hinge question (with answer and what to do if students get it wrong), and practice in three tiers ` +
  `(${compact ? 'support: 2 items, core: 2 items, stretch: 2 items' : 'support: 4 easier items, core: 4 items, stretch: 3 items'}). Every practice answer must be exact and in simplest form ("a/b", or "w a/b" for mixed numbers).\n` +
  `2. notes: one short, warm parent-note template (max 70 words) for EACH of these groups: ${noteGroups(t, compact).join(', ')} ` +
  `("secure" = did well; "default" = mixed results with no single pattern; the others are the mistake patterns above), ` +
  `in EACH of these languages: ${t.note_languages.join(', ')}. That is ${noteGroups(t, compact).length * t.note_languages.length} notes${compact ? ', each at most 40 words' : ''}. ` +
  `Each template MUST use the placeholders {{student}}, {{score}} and {{total}} literally (keep the double braces and the English placeholder words in every language). ` +
  `Do not invent names. Suggest one simple home activity where helpful.\n` +
  `In all text a teacher or parent reads, describe mistake patterns in plain words (for example "added the tops and the bottoms"), never with the ids above.\n\n` +
  `Class totals (JSON):\n${JSON.stringify(t)}`;

/** Groups that need a parent-note template: every mistake pattern seen, plus the general ones. */
export function noteGroups(t: ClassTotals, compact = false): string[] {
  const count = new Map<string, number>();
  for (const q of t.questions) for (const [k, v] of Object.entries(q.mistakes)) if (k !== 'other' && (v === 'hidden' || (typeof v === 'number' && v > 0))) count.set(k, (count.get(k) ?? 0) + (typeof v === 'number' ? v : 1));
  const seen = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  return compact ? [...seen.slice(0, 1), 'secure', 'default'] : [...seen, 'other', 'secure', 'default'];
}

export const WARMUP_PROMPT = 'Reply with the single word: ready';

/** Every word of Tickmark's fixed prompt text. A student named "Max" or "Do" must not block the plan. */
export const FIXED_VOCAB: ReadonlySet<string> = (() => {
  const all: ClassTotals = {
    v: 1, topic: 'fractions', grade_band: '4-8', sheets: 0, k: 3, note_languages: ['en', 'hi', 'ta'],
    questions: [{ q: 1, question: '', answer: '', correct: 0, unsimplified: 0, wrong: 0, blank: 0, unreadable: 0, mistakes: Object.fromEntries([...Object.keys(MISCONCEPTIONS), 'other'].map((k) => [k, 0])) }],
  };
  const text = [totalsPrompt(all), totalsPrompt(all, true), readSheetPrompt(10), rereadPrompt([1, 2]), WARMUP_PROMPT].join(' ');
  return new Set(fold(text).split(' ').filter(Boolean));
})();
