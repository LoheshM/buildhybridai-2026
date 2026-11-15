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
    // Indian-script names take case endings written onto the word (பிரியாவின் = "Priya's"): match the start of a word,
    // and for a name ending in a consonant, its stem (கண்ணன் → கண்ணனின், Murugan, Selvam → செல்வத்தின், Malayalam chillu)
    const indic = !/[a-z]/.test(tok);
    let at = -1;
    if (!indic || [...tok].length < 3) at = hay.indexOf(` ${tok} `);
    else for (const stem of stems(tok)) { at = hay.indexOf(` ${stem}`); if (at >= 0) break; }
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

const CHILLU: Record<string, string> = { 'ൻ': 'ന', 'ർ': 'ര', 'ൽ': 'ല', 'ൾ': 'ള', 'ൺ': 'ണ', 'ൿ': 'ക' };
const VIRAMA = /[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D]$/u;
/** The forms an Indian-script name can start with once a case ending is written on (round 6, R6-S1). Stems of 3+ code points only. */
export function stems(tok: string): string[] {
  const out = new Set<string>([tok]);
  const base = [...tok].map((ch) => CHILLU[ch] ?? ch).join('');
  out.add(base);
  const noVirama = base.replace(VIRAMA, '');
  out.add(noVirama);
  if (/ம்$/u.test(base)) out.add(base.replace(/ம்$/u, '')); // Tamil -ம் becomes -த்த- before an ending (செல்வம் → செல்வத்தின்)
  return [...out].filter((x) => [...x].length >= 3);
}
