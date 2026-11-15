// Second layer behind the closed payload: refuses any outbound text that contains a word from
// the class roster. Folding handles case, accents and full-width forms; word boundaries keep
// "Hope" from matching "hopefully". Roster words in Indian scripts also match with a suffix written on.
import { fold } from '../marking/roster';

/** Words that appear in our own fixed vocabulary; a student literally named "Other" must not block every call. */
const VOCAB = new Set(['other', 'correct', 'wrong', 'blank', 'fractions', 'question', 'answer', 'mistakes']);

export function rosterTokens(names: string[]): string[] {
  const t = new Set<string>();
  for (const n of names) for (const w of fold(n).split(' ')) if (w.length >= 2 && !/^\d+$/.test(w)) t.add(w);
  return [...t];
}

export interface NameHit { token: string; at: number }

/**
 * Returns roster words found in `text` (empty array = clean). Words in `ignore` (Tickmark's own
 * fixed prompt text, sent for every class) are skipped: they cannot identify a child, and the
 * closed payload remains the primary control.
 */
export function findRosterNames(text: string, tokens: string[], ignore: ReadonlySet<string> = new Set()): NameHit[] {
  const hay = ` ${fold(text)} `;
  const hits: NameHit[] = [];
  for (const tok of tokens) {
    if (VOCAB.has(tok) || ignore.has(tok)) continue;
    // Indian-script names take case endings written onto the word (பிரியாவின் = "Priya's"): match the start of a word
    const prefix = tok.length >= 3 && !/[a-z]/.test(tok);
    const at = hay.indexOf(prefix ? ` ${tok}` : ` ${tok} `);
    if (at >= 0) hits.push({ token: tok, at });
  }
  return hits;
}

/** Collects every string value inside a JSON-like value (keys are fixed by the schema). */
export function stringValues(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => stringValues(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => stringValues(x, out));
  return out;
}
