// Multiple choice, true/false and one-word answers. Pure code: exact, then case and spelling distance.
import { editDistance } from './roster';

const TF: Record<string, 'true' | 'false'> = { true: 'true', t: 'true', yes: 'true', y: 'true', '✓': 'true', false: 'false', f: 'false', no: 'false', n: 'false', '✗': 'false', x: 'false' };

/** Normalises "B", "(b)", "b)", "B.", "option B", "B 12" to "B"; "True"/"T"/"yes" to "true". Null if neither. */
export function normChoice(raw: string): string | null {
  const s = (raw ?? '').normalize('NFKC').trim().toLowerCase().replace(/^option\s+/, '').replace(/^answer\s*[:=]?\s*/, '');
  if (!s) return null;
  const tf = TF[s.replace(/[.!]+$/, '')];
  if (tf) return tf;
  const m = s.match(/^\(?([a-h])\)?(?:[.):]|\s|$)/);
  return m ? m[1].toUpperCase() : null;
}

/** Is the key a single option letter or true/false? */
export function looksChoice(key: string): boolean {
  const s = key.trim();
  return /^\(?[A-Ha-h]\)?\.?$/.test(s) || /^(true|false|t|f|yes|no)$/i.test(s);
}

export type ChoiceVerdict = { status: 'correct' | 'wrong' | 'unreadable'; picked: string | null };
export function markChoice(key: string, read: string): ChoiceVerdict {
  const k = normChoice(key);
  const s = normChoice(read);
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
  return key.split(/\s*(?:\/|\||;|\bor\b)\s*/i).map(normWord).filter(Boolean);
}

/** A key of one to three words with no sentence punctuation (and not a number). */
export function looksWord(key: string): boolean {
  const alts = key.split(/\s*(?:\/|\||;|\bor\b)\s*/i).map((s) => s.trim()).filter(Boolean);
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
