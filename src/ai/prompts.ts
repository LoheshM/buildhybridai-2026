// Prompts are versioned so measured accuracy can be tied to the exact wording.
import type { ClassTotals } from '../privacy/aggregate';

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

export const totalsPrompt = (t: ClassTotals) =>
  `You are helping a maths teacher (students aged 9-14) plan tomorrow's lesson. Below are ANONYMOUS class totals from a fractions check: ` +
  `no student names or individual answers. "mistakes" counts wrong answers by the mistake pattern a marking program detected ` +
  `(add_across = added tops and bottoms straight across; numerators_only = combined numerators but kept one denominator; ` +
  `denominators_multiplied; whole_dropped = lost the whole number of a mixed number; cross_multiply; no_invert = divided without flipping; ` +
  `flipped_first; reversed_subtraction; wrong_operation; slip = arithmetic slip; other = unexplained). A value of "hidden" is a small group hidden for privacy (or a number that would reveal one); treat it as "a few".\n\n` +
  `Write:\n` +
  `1. plan: a reteach mini-lesson of at most 15 minutes aimed at the most common mistake pattern, with 3-5 steps, ` +
  `a hinge question (with answer and what to do if students get it wrong), and practice in three tiers ` +
  `(support: 4 easier items, core: 4 items, stretch: 3 items). Every practice answer must be exact and in simplest form ("a/b", or "w a/b" for mixed numbers).\n` +
  `2. notes: one short, warm parent-note template (max 70 words) for EACH mistake group that has at least one count, plus one for "secure" (students who did well), ` +
  `in each of these languages: ${t.note_languages.join(', ')}. Each template MUST use the placeholders {{student}}, {{score}} and {{total}} literally (keep the double braces and English placeholder words in every language). ` +
  `Do not invent names. Suggest one simple home activity where helpful.\n\n` +
  `Class totals (JSON):\n${JSON.stringify(t)}`;

export const WARMUP_PROMPT = 'Reply with the single word: ready';
