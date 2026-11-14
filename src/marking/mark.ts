// Marks one read answer against the teacher's key and decides which flags the teacher sees.
import { eq, evaluate, isLowest, mixedAlternatives, parse, parseExpr, type Expr, type Frac, type Parsed } from './fraction';
import { detect, type MisconceptionId } from './misconceptions';

export interface QuestionKey {
  q: number;
  prompt: string; // e.g. "2/3 + 1/6" (may be empty for a generic exact-match key)
  answer: string; // teacher's key, e.g. "5/6"
}

export type Status = 'correct' | 'unsimplified' | 'wrong' | 'blank' | 'unreadable';

export type Flag =
  | 'two_answers'
  | 'crossed_out'
  | 'unreadable'
  | 'unusual'
  | 'mixed_number_check'
  | 'letters'
  | 'reread_disagreed'
  | 'teacher_changed';

export const FLAG_TEXT: Record<Flag, string> = {
  two_answers: 'Two answers',
  crossed_out: 'Crossed-out work',
  unreadable: "Couldn't read",
  unusual: 'Unusual answer',
  mixed_number_check: 'Check the mixed number',
  letters: 'Letters in a number box',
  reread_disagreed: 'Second read disagreed',
  teacher_changed: 'Changed by you',
};

export interface Marked {
  q: number;
  read: string; // what was read (or typed)
  crossedOut: string;
  status: Status;
  misconception: MisconceptionId | null;
  flags: Flag[];
  /** Alternative readings worth offering the teacher as one-tap fixes. */
  suggestions: string[];
  /** Set when the teacher has looked at this answer and accepted or corrected it. */
  checked?: boolean;
}

export interface KeyInfo {
  expr: Expr | null;
  value: Frac | null;
  keyParsed: Parsed;
}

export function keyInfo(k: QuestionKey): KeyInfo {
  const expr = k.prompt ? parseExpr(k.prompt) : null;
  const keyParsed = parse(k.answer);
  const value = keyParsed.kind === 'value' ? keyParsed.value : expr ? evaluate(expr) : null;
  return { expr, value, keyParsed };
}

/** Does the key itself agree with the prompt? (Catches teacher typos before marking.) */
export function keyProblem(k: QuestionKey): string | null {
  const info = keyInfo(k);
  if (info.keyParsed.kind !== 'value') return k.prompt ? 'The answer could not be read as a number.' : null;
  if (info.expr && !eq(evaluate(info.expr), info.keyParsed.value)) return 'This answer does not equal the question.';
  const kp = info.keyParsed;
  if ((kp.form === 'fraction' && !isLowest(kp.value)) || (kp.form === 'mixed' && !isLowest({ n: kp.value.n % kp.value.d, d: kp.value.d }))) {
    return 'Write the answer in simplest form (for example 2/4 → 1/2), so students who simplify get full marks.';
  }
  return null;
}

export function markAnswer(k: QuestionKey, read: string, crossedOut = ''): Marked {
  const info = keyInfo(k);
  const flags: Flag[] = [];
  const suggestions: string[] = [];
  const p = parse(read);
  // Models sometimes repeat the final answer as "crossed out"; that is noise, not crossed-out work.
  const coRaw = (crossedOut ?? '').trim();
  const co = coRaw && coRaw.replace(/\s+/g, '') !== (read ?? '').replace(/\s+/g, '') ? coRaw : '';
  if (co) flags.push('crossed_out');

  let status: Status;
  let misconception: MisconceptionId | null = null;

  const genericKey = !info.value && info.keyParsed.kind !== 'value';
  if (p.kind === 'blank') {
    status = 'blank';
  } else if (genericKey) {
    // exact-match key for non-numeric answers (words, labels)
    status = norm(read) === norm(k.answer) ? 'correct' : 'wrong';
  } else if (p.kind === 'multiple') {
    status = 'unreadable';
    flags.push('two_answers');
    suggestions.push(...p.parts);
  } else if (p.kind === 'unparseable') {
    status = 'unreadable';
    flags.push(/[a-z]/i.test(p.text) ? 'letters' : 'unreadable');
  } else if (!info.value) {
    status = 'wrong';
  } else {
    const v = p.value;
    if (eq(v, info.value)) {
      status = p.form === 'fraction' && !isLowest(v) ? 'unsimplified' : 'correct';
      if (p.form === 'mixed' && !isLowest({ n: v.n % v.d, d: v.d })) status = 'unsimplified';
    } else {
      status = 'wrong';
      misconception = info.expr ? detect(info.expr, v) : null;
      // "slip" and "different operation" are weak explanations: a one-digit misread looks exactly like them.
      if (!misconception || misconception === 'slip' || misconception === 'wrong_operation') flags.push('unusual');
    }
    // "11/2" where "1 1/2" was probably written: never auto-accept, always ask.
    const alts = mixedAlternatives(p.text);
    if (alts.length && info.value) {
      const hit = alts.find((a) => { const ap = parse(a); return ap.kind === 'value' && eq(ap.value, info.value!); });
      const keyIsMixed = info.keyParsed.kind === 'value' && info.keyParsed.form === 'mixed';
      if (hit || keyIsMixed) { flags.push('mixed_number_check'); suggestions.push(...(hit ? [hit] : alts)); }
    }
  }
  return { q: k.q, read: read ?? '', crossedOut: co, status, misconception, flags: dedupe(flags), suggestions: dedupe(suggestions).filter((x) => x.trim() !== '') };
}

const norm = (s: string) => (s ?? '').normalize('NFKC').toLowerCase().replace(/[.,;:!?]+$/, '').replace(/\s+/g, ' ').trim();
const dedupe = <T,>(xs: T[]) => [...new Set(xs)];

export interface SheetScore { points: number; outOf: number; correct: number; unsimplified: number; wrong: number; blank: number; unreadable: number }

/** Unsimplified answers earn `unsimplifiedCredit` (0, 0.5 or 1). Unreadable answers block the score until checked. */
export function scoreSheet(marks: Marked[], unsimplifiedCredit = 0.5): SheetScore {
  const s: SheetScore = { points: 0, outOf: marks.length, correct: 0, unsimplified: 0, wrong: 0, blank: 0, unreadable: 0 };
  for (const m of marks) {
    s[m.status]++;
    if (m.status === 'correct') s.points += 1;
    if (m.status === 'unsimplified') s.points += unsimplifiedCredit;
  }
  return s;
}

/** Questions worth a second, targeted on-device read. */
export function needsReread(k: QuestionKey, m: Marked): boolean {
  const keyMixed = keyInfo(k).keyParsed;
  const readP = parse(m.read);
  return (
    m.status === 'blank' ||
    m.flags.length > 0 ||
    m.status === 'unreadable' ||
    (keyMixed.kind === 'value' && keyMixed.form === 'mixed') ||
    (readP.kind === 'value' && readP.form === 'mixed') ||
    (m.status === 'wrong' && (!m.misconception || m.misconception === 'slip' || m.misconception === 'wrong_operation'))
  );
}
