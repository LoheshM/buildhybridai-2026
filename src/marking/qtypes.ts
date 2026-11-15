// The answer key picks the question type. Deterministic code, never the model; the teacher can
// override any question. The type decides who marks it: code for exact answers, Gemini Nano
// suggests (and the teacher decides) for open answers.
import { parse, parseExpr } from './fraction';
import { looksAlgebraic } from './algebra';
import { parseQuantity } from './numeric';
import { looksChoice, looksWord } from './words';

export type QType = 'fraction' | 'number' | 'algebra' | 'choice' | 'word' | 'short' | 'passage';

export const QTYPES: Record<QType, { label: string; short: string; example: string; markedBy: 'code' | 'suggested' }> = {
  fraction: { short: 'Fraction', label: 'Fraction', example: '3/4, 1 1/2', markedBy: 'code' },
  number: { short: 'Number', label: 'Number or measurement', example: '0.75, -12, 3.5 cm, 45%', markedBy: 'code' },
  algebra: { short: 'Algebra', label: 'Algebra', example: 'x = 4, 2x + 3', markedBy: 'code' },
  choice: { short: 'Choice', label: 'Multiple choice or true/false', example: 'B, True', markedBy: 'code' },
  word: { short: 'Word', label: 'One word', example: 'photosynthesis, Paris', markedBy: 'code' },
  short: { short: 'Short answer', label: 'Short answer (key points)', example: 'makes food; uses sunlight', markedBy: 'suggested' },
  passage: { short: 'Paragraph', label: 'Paragraph (rubric)', example: 'Rubric: Ideas 3; Organisation 2', markedBy: 'suggested' },
};

export const isOpen = (t: QType) => QTYPES[t].markedBy === 'suggested';

/** A rubric: "Rubric: ..." or two or more lines/parts each ending in a mark, e.g. "Ideas (3)". */
export function parseRubric(key: string): { line: string; max: number }[] | null {
  const body = key.replace(/^\s*rubric\s*[:-]?\s*/i, '');
  const parts = body.split(/\s*(?:\n|;)\s*/).map((s) => s.trim()).filter(Boolean);
  const lines = parts.map((p) => {
    const m = p.match(/^(.*?)[\s:–-]*\(?\s*(\d{1,2})\s*(?:marks?|pts?|points?)?\s*\)?\s*$/i);
    return m && m[1].trim() && /\p{L}/u.test(m[1]) ? { line: m[1].replace(/[\s:–-]+$/, '').trim(), max: Number(m[2]) } : null;
  });
  if (lines.length >= 2 && lines.every((l) => l && l.max >= 1 && l.max <= 10)) return lines as { line: string; max: number }[];
  return null;
}

/** Key points of a short answer: split on ";" or new lines. One sentence is one key point. */
export function keyPoints(key: string): string[] {
  return key.split(/\s*(?:\n|;)\s*/).map((s) => s.trim().replace(/[.]+$/, '')).filter(Boolean).slice(0, 6);
}

/** "3.14 (2 dp)" → "3.14": a note in brackets after an exact answer is for the teacher, not part of the answer. */
const NOTE = /^(?:to\s+)?(?:\d+\s*(?:dp|d\.p\.|sf|s\.f\.|decimal places?|significant figures?)|nearest\s+\w+(?:\s+\w+)?|simplest form|lowest terms|in words|any order|or equivalent|accept\s.+|exact|rounded)$/i;
export function keyCore(key: string): string {
  const k = (key ?? '').trim();
  const m = k.match(/^(.*?\S)\s*\(([^()]*)\)$/);
  // round 6 (E6-01): "3(2 + xy)", "carbon dioxide (CO2)" and "12 (cm)" are answers, not notes
  return m && NOTE.test(m[2].trim()) && !/[;\n]/.test(k) ? m[1] : k;
}

/** Picks the type from the key text (and the printed question, when it helps). */
export function detectType(key: string, prompt = ''): QType {
  const full = (key ?? '').trim();
  if (/^\s*rubric\b/i.test(full) || parseRubric(full)) return 'passage';
  const k = keyCore(full);
  if (!k) return 'short';
  if (/^\s*rubric\b/i.test(k) || parseRubric(k)) return 'passage';
  const p = parse(k);
  if (p.kind === 'value' && (p.form === 'fraction' || p.form === 'mixed')) return 'fraction';
  // a printed fraction sum ("2/3 + 1/6") makes it a fraction question whatever the key looks like
  if (prompt && /\d\s*\/\s*\d/.test(prompt) && parseExpr(prompt)) return 'fraction'; // "7 x 8" is not a fraction sum (round 6)
  if (looksChoice(k)) return 'choice';
  if (parseQuantity(k)) {
    // an integer key for a fraction sum ("2/3 + 1/3 = 1") is still the fraction engine's
    if (p.kind === 'value' && p.form === 'integer' && /\d\s*\/\s*\d/.test(prompt)) return 'fraction';
    return 'number';
  }
  if (looksAlgebraic(k)) return 'algebra';
  if (looksWord(k)) return 'word';
  return 'short';
}

/** Marks available for a question: 1 for exact answers, key points or rubric total for open ones. */
export function marksFor(type: QType, key: string, override?: number): number {
  if (override && override > 0) return override;
  if (type === 'passage') return (parseRubric(key) ?? []).reduce((a, l) => a + l.max, 0) || 1;
  if (type === 'short') return Math.max(1, keyPoints(key).length);
  return 1;
}
