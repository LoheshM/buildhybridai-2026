// Multiple choice, true/false and one-word answers. Pure code: exact, then case and spelling distance.
import { editDistance } from './roster';

const TF: Record<string, 'true' | 'false'> = { true: 'true', t: 'true', yes: 'true', y: 'true', '✓': 'true', false: 'false', f: 'false', no: 'false', n: 'false', '✗': 'false', x: 'false' };

/**
 * Normalises "B", "(b)", "b)", "B.", "option B", "B 12" to "B"; "True"/"T"/"yes" to "true". Null if neither.
 * In letter mode (the key is an option letter) "F" is option F and "X" is no option: true/false is
 * only read from whole words there.
 */
export function normChoice(raw: string, letters = false): string | null {
  const s = (raw ?? '').normalize('NFKC').trim().toLowerCase().replace(/^option\s+/, '').replace(/^answer\s*[:=]?\s*/, '');
  if (!s) return null;
  const bare = s.replace(/[.!]+$/, '').replace(/^\((.*)\)$/, '$1').replace(/\)$/, '');
  const tf = TF[bare];
  if (tf && (!letters || bare.length > 1)) return tf;
  if (letters && /^[✓✗x]$/.test(bare)) return null;
  const m = s.match(/^\(?([a-h])\)?(?:[.):]|\s|$)/);
  return m ? m[1].toUpperCase() : null;
}

/** Is the key a single option letter or true/false? */
export function looksChoice(key: string): boolean {
  const s = key.trim();
  return /^\(?[A-Ha-h]\)?\.?$/.test(s) || /^(true|false|t|f|yes|no)$/i.test(s);
}

export type ChoiceVerdict = { status: 'correct' | 'wrong' | 'unreadable'; picked: string | null };
/** A key that is one option letter, A to H ("F" included: true/false keys are written as words or T). */
const isLetterKey = (key: string) => /^\(?[A-Ha-h]\)?[.)]?$/.test(key.trim());

/** The key's letter mode: an option letter, except "F" (or "T") on a true/false question. */
// "F" is False on a true/false question (or with no question text); otherwise it is option F
export const choiceLetterMode = (key: string, prompt = '') => isLetterKey(key) && !(/^\(?f\)?[.)]?$/i.test(key.trim()) && (!prompt.trim() || /\btrue\s*(?:or|\/)\s*false\b|\bT\s*(?:or|\/)\s*F\b|\bfalse\b|✓\s*(?:or|\/)\s*✗|\bright or wrong\b|\bis (?:this|the statement) (?:correct|true)\b/i.test(prompt)));

export function markChoice(key: string, read: string, prompt = ''): ChoiceVerdict & { two?: boolean } {
  const letterMode = choiceLetterMode(key, prompt);
  const k = normChoice(key, letterMode);
  // two different option letters ("D C", "B or C", "B and C", "B + C") is two answers, never the first one
  const joined = (read ?? '').replace(/\b(?:and|or|then|plus|also|&)\b|[+&]/gi, ' ');
  const letters = new Set((joined.toUpperCase().match(/(?:^|[^A-Z])([A-H])(?=[^A-Z]|$)/g) ?? []).map((x) => x.replace(/[^A-H]/g, '')));
  if (letters.size > 1 && /^[\s(),.;/A-H]*$/i.test(joined)) return { status: 'unreadable', picked: null, two: true };
  // a true/false word against an F or T option key: maybe a true/false question in other words ("✓ or ✗", "is this correct?"): the teacher looks
  if (letterMode && /^[FT]$/.test(k ?? '') && /^(true|false|yes|no|✓|✗)[.!]?$/i.test((read ?? '').trim())) return { status: 'unreadable', picked: null };
  const s = normChoice(read, letterMode);
  if (!s) return { status: 'unreadable', picked: null };
  return { status: s === k ? 'correct' : 'wrong', picked: s };
}

const ARTICLES = /^(the|a|an|to)\s+/;
/** Lower case, no accents or punctuation, no leading article: "The Nucleus." → "nucleus". */
export function normWord(raw: string): string {
  return (raw ?? '').normalize('NFKD').replace(/\p{M}/gu, '').normalize('NFKC').toLowerCase()
    .replace(/[’']/g, "'").replace(/[^\p{L}\p{N}' -]+/gu, ' ').replace(/\s+/g, ' ').trim().replace(ARTICLES, '');
}

/** "evaporation / evaporating | evaporate" → the accepted answers. */
export function alternatives(key: string): string[] {
  return key.split(/\s*(?:\/|\||\bor\b)\s*/i).map(normWord).filter(Boolean);
}

/** A key of one to three words with no sentence punctuation (and not a number). ";" and new lines mean key points, so those are short answers. */
export function looksWord(key: string): boolean {
  if (/[;\n]/.test(key)) return false;
  const alts = key.split(/\s*(?:\/|\||\bor\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  return alts.length > 0 && alts.every((a) => /^[\p{L}][\p{L}'’ -]*$/u.test(a) && a.split(/\s+/).length <= 3 && a.length <= 30);
}

export type WordMistake = 'spelling' | 'wrong_term';
export interface WordVerdict { status: 'correct' | 'wrong' | 'unreadable'; mistake: WordMistake | null; closest?: string; extraWords?: boolean }

/** Allowed spelling distance: none for very short words, 1 up to 8 letters, 2 beyond. */
const allowance = (w: string) => (w.length <= 3 ? 0 : w.length <= 8 ? 1 : 2); // "writed" (2 edits) is a wrong form of "written", not a misspelling

/**
 * Exact (after normalising) is correct. A near spelling is "spelling": correct with a note when
 * spelling doesn't count, wrong when it does (a spelling test). Anything else is a wrong term.
 */
export function markWord(key: string, read: string, spellingCounts = false): WordVerdict {
  const s = normWord(read);
  if (!s) return { status: 'unreadable', mistake: null };
  const alts = alternatives(key);
  if (alts.includes(s)) return { status: 'correct', mistake: null };
  // "the nucleus of the cell" for "nucleus": the key word is there, with extra words
  let best = { d: Infinity, alt: '' };
  for (const a of alts) { const d = editDistance(s, a); if (d < best.d) best = { d, alt: a }; }
  if (best.d <= allowance(best.alt)) return spellingCounts ? { status: 'wrong', mistake: 'spelling', closest: best.alt } : { status: 'correct', mistake: 'spelling', closest: best.alt };
  if (alts.some((a) => new RegExp(`(^|\\s)${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(s)) && s.split(' ').length <= 6) return { status: 'correct', mistake: null, closest: alts[0], extraWords: true }; // the teacher is asked to check
  return { status: 'wrong', mistake: 'wrong_term' };
}
