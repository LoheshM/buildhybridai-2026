// Prompts are versioned so measured accuracy can be tied to the exact wording.
import type { ClassTotals } from '../privacy/aggregate';
import { MISTAKES } from '../marking/mistakes';
import { fold } from '../marking/roster';

import { typeOf, type QuestionKey } from '../marking/mark';
import type { QType } from '../marking/qtypes';

export const PROMPTS_VERSION = 'v2-2026-11-16';

const HINT: Record<QType, string> = {
  fraction: 'a fraction such as 3/4, or a mixed number such as 1 1/2',
  number: 'a number, maybe with a unit or a % sign',
  algebra: 'an algebra answer such as x = 4',
  choice: 'one option letter, or True or False',
  word: 'one or a few words',
  short: 'one or two sentences',
  passage: 'a paragraph of several lines',
};

/**
 * Day-1 probe (16 Nov): one required field per question, each anchored to its printed question,
 * cut real-handwriting character errors from 20.8% to 4.8% on completed reads (docs/research/06).
 */
export const readSheetPrompt = (keys: Pick<QuestionKey, 'q' | 'prompt' | 'answer' | 'type'>[]) =>
  `This is a photo of a student's worksheet with ${keys.length} numbered printed questions. The student has handwritten an answer to each one. ` +
  `Copy each handwritten answer exactly as written, word for word, keeping the student's spelling and punctuation; join lines with a space. ` +
  `Never copy printed text. Do not correct mistakes. Use "a/b" for a fraction and "w a/b" with a space for a mixed number. ` +
  `If the student struck through an answer with a line, put it in crossedOut and the other answer in answer (empty strings if none). Use an empty string for a blank answer.\n` +
  keys.map((k, i) => `q${i + 1}: the answer to "${k.q}) ${(k.prompt || '').slice(0, 90)}" (${HINT[typeOf(k as QuestionKey)]})`).join('\n') +
  `\nAlso copy the handwritten student name (empty string if there is none).`;

const COPY_ONLY = 'Copy the student\'s handwriting exactly as written, letter by letter, keeping every spelling mistake and every wrong answer; never correct, complete or answer anything yourself. ' +
  // no literal placeholders ("a/b", "answer"): Nano echoed them back instead of reading (16 Nov bench)
  'Write a fraction with a slash, and a whole number before a fraction with a space, as the student wrote them; never simplify. If the student struck something through with a line, give it as crossed out.';

/**
 * The strip: each answer box cut out of a Tickmark answer sheet, on its own labelled row. No
 * question text anywhere (16 Nov bench: shown the question, Gemini Nano answered it instead of
 * copying the pupil; per-box reading brought unflagged wrong marks from 15-40% to a few percent).
 */
export const stripPrompt = (keys: Pick<QuestionKey, 'q' | 'prompt' | 'answer' | 'type'>[]) =>
  `This image shows boxes cut from one student's answer sheet. Each row starts with a printed label, "Name" or a box number, and then the box. Every box in the image has handwriting in it. ` +
  `For each label, ${COPY_ONLY.charAt(0).toLowerCase()}${COPY_ONLY.slice(1)}\n` +
  `studentName: the handwriting in the row labelled Name\n` +
  keys.map((k) => `q${k.q}: the handwriting in the row labelled ${k.q} (${HINT[typeOf(k as QuestionKey)]})`).join('\n');

/** Second look at a few rows of the strip. */
export const stripRereadPrompt = (qs: number[], keys: Pick<QuestionKey, 'q' | 'prompt' | 'answer' | 'type'>[]) =>
  `This image shows boxes cut from one student's answer sheet, each row labelled with its box number. Look carefully at the rows labelled ${qs.join(', ')} only. ` +
  `For each of them, ${COPY_ONLY.charAt(0).toLowerCase()}${COPY_ONLY.slice(1).replace('in crossedOut', 'in crossedOutText').replace('in answer', 'in finalAnswer')}\n` +
  keys.filter((k) => qs.includes(k.q)).map((k) => `Row ${k.q}: ${HINT[typeOf(k as QuestionKey)]}.`).join('\n');

/** A whole answer-sheet photo (cloud reads of the made-up sample sheets only). Boxes, never questions. */
export const answerSheetPrompt = (keys: Pick<QuestionKey, 'q' | 'prompt' | 'answer' | 'type'>[]) =>
  `This is a photo of a student's Tickmark answer sheet: a "Name" box and numbered answer boxes. ${COPY_ONLY} Use an empty string for an empty box.\n` +
  `studentName: the handwriting in the Name box\n` +
  keys.map((k) => `q${k.q}: the handwriting in box ${k.q} (${HINT[typeOf(k as QuestionKey)]})`).join('\n');

/** Second, targeted read of a few questions, anchored to their printed questions when the keys are given. */
export const rereadPrompt = (qs: number[], keys: Pick<QuestionKey, 'q' | 'prompt' | 'answer' | 'type'>[] = []) =>
  `This is a photo of a student's worksheet. Look carefully at questions ${qs.join(', ')} only. ` +
  `For each of them, copy the student's final handwritten answer exactly as written. ` +
  `If a whole number is written to the left of a fraction, include it with a space, for example "1 1/2". ` +
  `If an answer has a line through it, it is crossed out: put it in crossedOutText (empty string if nothing is crossed out) and use the other answer as finalAnswer. Use an empty string if there is no answer.` +
  ' You are copying, not answering: never answer a question yourself, and copy a wrong answer as it is.' +
  // the question's text is NOT given: with it, Nano answered the question instead of copying (bench, 16 Nov)
  (keys.length ? '\n' + keys.filter((k) => qs.includes(k.q)).map((k) => `Question ${k.q}: the student's answer is ${HINT[typeOf(k as QuestionKey)]}.`).join('\n') : '');

/**
 * A suggested mark for one short answer. Day-1 probe (SciEntsBank, real grade 3-6 answers marked by
 * people): a holistic mark first, then the missing key points, then a reason, agreed best with the
 * human marks and never gave a wrong answer full marks on the dev split; asking Nano to tick or quote
 * each key point over-credited wrong answers. The teacher always decides.
 */
export const suggestShortPrompt = (question: string, points: string[], answer: string) =>
  `You are helping a teacher mark one short answer.\nQuestion: ${question || '(not given)'}\n` +
  `Teacher's key points (a full answer states all of them):\n${points.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n` +
  `Student's answer: ${answer}\n\n` +
  `Judge the meaning, not the wording, spelling or grammar.\n` +
  `"full" = the student states every key point, in any words.\n` +
  `"partial" = some of it is right, but a key point is missing or too vague.\n` +
  `"none" = wrong, contradicts a key point, or does not answer the question.\n` +
  `Give the mark, then the numbers of any key points the student did not state, then a one-sentence reason a teacher can check.`;

export const suggestPassagePrompt = (question: string, rubric: { line: string; max: number }[], answer: string) =>
  `You are helping a teacher mark a student's paragraph.\nTask: ${question || '(not given)'}\n` +
  `Teacher's rubric:\n${rubric.map((r, i) => `l${i + 1}: ${r.line} (0 to ${r.max})`).join('\n')}\n` +
  `Student's paragraph: ${answer}\n\n` +
  `Score the paragraph on each rubric line, from 0 to that line's maximum. Judge what is written, as a fair teacher would for a student of this age. ` +
  `Then give a one-sentence reason a teacher can check.`;

/** compact: the on-device variant (Gemini Nano writes far fewer tokens per second than the cloud). */
const SUBJECT_TEXT: Record<ClassTotals['subject'], string> = { maths: 'maths', science: 'science', english: 'English', other: 'school' };
const AGES: Record<ClassTotals['grade_band'], string> = { '4-6': '9-12', '7-9': '12-15', '10-12': '15-18' };

/** The mistake ids that appear in these totals, each with its plain-words meaning (keeps the prompt short). */
function mistakeGlossary(t: ClassTotals): string {
  const ids = new Set<string>();
  for (const q of t.questions) for (const k of Object.keys(q.mistakes)) ids.add(k);
  return [...ids].filter((k) => k !== 'other').map((k) => `${k} = ${(MISTAKES as Record<string, { teacher: string }>)[k]?.teacher ?? k}`).join('; ') || 'none listed';
}

export const totalsPrompt = (t: ClassTotals, compact = false) => {
  const maths = t.subject === 'maths';
  return `You are helping a ${SUBJECT_TEXT[t.subject]} teacher (students aged ${AGES[t.grade_band]}) plan tomorrow's lesson. Below are ANONYMOUS class totals from a short check: ` +
  `no student names and no student answers. For each question: "type" is the question type, "answer" and "key_points" or "rubric" are the teacher's own key, ` +
  `"right", "partial" and "wrong" count students with full, some and no marks (the class size is not given), and "mistakes" counts the mistake patterns a marking program detected or the teacher confirmed ` +
  `(${mistakeGlossary(t)}; missing_point_N = did not state key point N of the teacher's key; rubric_low_N = scored half or less on rubric line N; other = unexplained). ` +
  `"wrong_options" counts wrong multiple-choice answers by the option chosen. A value of "hidden" is a small group hidden for privacy; treat it as "a few". A question with no mistakes listed may have had its breakdown withheld for privacy.\n\n` +
  `Write:\n` +
  `1. plan: a reteach mini-lesson of at most 15 minutes aimed at the most common mistake or missed key point, with ${compact ? '3 short' : '3-5'} steps (each with one full sentence for what the teacher does and one for what students do), ` +
  `a hinge question (with answer and what to do if students get it wrong), and practice in three tiers ` +
  `(${compact ? 'support: 2 items, core: 2 items, stretch: 2 items' : 'support: 4 easier items, core: 4 items, stretch: 3 items'}). Use NEW questions, not the quiz's own. ` +
  (maths
    ? `Write each practice question as a plain sum such as "2/5 + 1/10" or "0.4 + 0.35". Every practice answer must be exact and in simplest form ("a/b", or "w a/b" for mixed numbers). `
    : `Write each practice question as a short question with a short model answer. `) +
  `The hinge question must target the most common mistake.\n` +
  `2. notes: one short, warm parent-note template (max 70 words) for EACH of these groups: ${noteGroups(t, compact).join(', ')} ` +
  `("secure" = did well; "default" = mixed results with no single pattern; the others are the mistake patterns above), ` +
  `in EACH of these languages: ${t.note_languages.join(', ')}. That is ${noteGroups(t, compact).length * t.note_languages.length} notes${compact ? ', each at most 40 words' : ''}. ` +
  `Each template MUST use the placeholders {{student}}, {{score}} and {{total}} literally (keep the double braces and the English placeholder words in every language). ` +
  `Do not invent names. Suggest one simple home activity where helpful.\n` +
  `In all text a teacher or parent reads, describe mistake patterns in plain words (for example "added the tops and the bottoms", "did not say where the energy comes from"), never with the ids above.\n\n` +
  `Class totals (JSON):\n${JSON.stringify(t)}`;
};

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
  const text = [WARMUP_PROMPT, readSheetPrompt([]), rereadPrompt([1, 2])];
  for (const subject of ['maths', 'science', 'english', 'other'] as const) for (const grade_band of ['4-6', '7-9', '10-12'] as const) {
    const all: ClassTotals = {
      v: 2, subject, grade_band, k: 3, note_languages: ['en', 'hi', 'ta'],
      questions: [{ q: 1, type: 'fraction', question: '', answer: '', right: 0, partial: 0, wrong: 0, mistakes: Object.fromEntries([...Object.keys(MISTAKES), 'other'].map((k) => [k, 0])) }],
    };
    text.push(totalsPrompt(all), totalsPrompt(all, true));
  }
  for (const h of Object.values(HINT)) text.push(h);
  return new Set(fold(text.join(' ')).split(' ').filter(Boolean));
})();
