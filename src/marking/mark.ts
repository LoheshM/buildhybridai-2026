// Marks one read answer against the teacher's key and decides which flags the teacher sees.
// The key picks the question type (qtypes.ts). Exact types are marked here, in code. Open types
// (short answers, paragraphs) wait as "pending" for Gemini Nano's suggestion and the teacher's decision.
import { eq, evaluate, isLowest, mixedAlternatives, parse, parseExpr, type Expr, type Frac, type Parsed } from './fraction';
import { detect, type MisconceptionId } from './misconceptions';
import type { MistakeId } from './mistakes';
import { markAlgebra } from './algebra';
import { markQuantity } from './numeric';
import { detectType, isOpen, keyCore, marksFor, parseRubric, type QType } from './qtypes';
import { markChoice, markWord } from './words';

export interface QuestionKey {
  q: number;
  prompt: string; // e.g. "2/3 + 1/6", or the printed question (may be empty)
  answer: string; // teacher's key, e.g. "5/6", "photosynthesis", "makes food; uses sunlight"
  type?: QType; // the teacher's override; otherwise detected from the key
  marks?: number; // marks available (open questions); exact questions are worth 1
  tolerance?: number; // numbers: absolute tolerance in the key's unit
  spellingCounts?: boolean; // words: a near spelling is wrong (a spelling test)
}

export const typeOf = (k: QuestionKey): QType => k.type ?? detectType(k.answer, k.prompt);
export const outOfFor = (k: QuestionKey): number => marksFor(typeOf(k), k.answer, k.marks);

export type Status = 'correct' | 'unsimplified' | 'partial' | 'wrong' | 'blank' | 'unreadable' | 'pending';

export type Flag =
  | 'two_answers'
  | 'crossed_out'
  | 'unreadable'
  | 'unusual'
  | 'mixed_number_check'
  | 'letters'
  | 'reread_disagreed'
  | 'extra_words'
  | 'check_reading'
  | 'check_spelling'
  | 'talks_to_marker'
  | 'teacher_changed';

export const FLAG_TEXT: Record<Flag, string> = {
  two_answers: 'Two answers',
  crossed_out: 'Crossed-out work',
  unreadable: "Couldn't read",
  unusual: 'Unusual answer',
  mixed_number_check: 'Check the mixed number',
  letters: 'Letters in a number box',
  reread_disagreed: 'Second read disagreed',
  extra_words: 'Key word plus extra words',
  check_reading: 'Check the reading',
  check_spelling: 'Check the spelling',
  talks_to_marker: 'Talks to the marker: no suggestion',
  teacher_changed: 'Changed by you',
};

/** Gemini Nano's suggested mark for an open answer. Always shown as a suggestion; the teacher decides. */
export interface Suggestion {
  points: number; // computed in code from `met` / `lines`, never taken from the model directly
  outOf: number;
  met?: boolean[]; // short answers: one per key point
  contradicts?: boolean;
  named?: number[]; // short answers: the key points the model itself said were missing
  lines?: { score: number; max: number }[]; // paragraphs: one per rubric line
  reason: string;
  where: 'on_device' | 'in_cloud' | 'recorded' | 'recorded_device';
  ms: number;
  adjusted?: boolean; // the teacher changed the pencil before inking it
}

export interface Marked {
  q: number;
  read: string; // what was read (or typed)
  crossedOut: string;
  status: Status;
  misconception: MistakeId | null;
  flags: Flag[];
  /** Alternative readings worth offering the teacher as one-tap fixes. */
  suggestions: string[];
  /** Set when the teacher has looked at this answer and accepted or corrected it. */
  checked?: boolean;
  decidedBy?: 'sample_key'; // a made-up class decided from its own answer key (never a real class)
  /** The model's own reading and whether it was flagged, kept for the accuracy card. */
  modelRead?: string;
  modelFlagged?: boolean;
  type?: QType;
  outOf?: number; // marks available (default 1)
  points?: number; // awarded marks when set by the teacher on an open question
  mistakes?: MistakeId[]; // open questions: every key point missed, or a misconception
  picked?: string; // multiple choice: the option chosen
  note?: string; // what code noticed, e.g. "Same amount in mm"
  suggestion?: Suggestion; // open questions only
  met?: boolean[]; // short answers: the key points the teacher credited
  lines?: { score: number; max: number }[]; // paragraphs: the teacher's rubric scores
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
export function keyProblem(kIn: QuestionKey): string | null {
  const type = typeOf(kIn);
  const k = isOpen(type) ? kIn : { ...kIn, answer: keyCore(kIn.answer), type };
  if (!k.answer.trim()) return 'Add an answer.';
  if (type === 'number' && !markQuantity(keyCore(k.answer), keyCore(k.answer)).status.startsWith('correct')) return 'The answer could not be read as a number.';
  if (type === 'algebra' && markAlgebra(keyCore(k.answer), keyCore(k.answer)).status !== 'correct') return 'The answer could not be read as algebra (for example x = 4 or 2x + 3).';
  if (type === 'choice' && markChoice(k.answer, k.answer, k.prompt).status !== 'correct') return 'Use one option letter (A to H) or True/False.';
  if (type === 'passage' && !parseRubric(k.answer)) return 'Write the rubric as lines with marks, for example "Ideas 3; Organisation 2".';
  if (type === 'short' && k.answer.split(/\s*(?:\n|;)\s*/).filter((x) => x.trim()).length > 6) return 'Use at most 6 key points (separate them with ;).';
  if (type === 'passage' && (parseRubric(k.answer)?.length ?? 0) > 4) return 'Use at most 4 rubric lines.';
  if (type !== 'fraction') return null;
  const info = keyInfo(k);
  if (info.keyParsed.kind !== 'value') return k.prompt ? 'The answer could not be read as a number.' : null;
  if (info.expr && !eq(evaluate(info.expr), info.keyParsed.value)) return 'This answer does not equal the question.';
  const kp = info.keyParsed;
  if ((kp.form === 'fraction' && !isLowest(kp.value)) || (kp.form === 'mixed' && !isLowest({ n: kp.value.n % kp.value.d, d: kp.value.d }))) {
    return 'Write the answer in simplest form (for example 2/4 → 1/2), so students who simplify get full marks.';
  }
  return null;
}

/** Marks one answer by its question type. */
export function markAnswer(kIn: QuestionKey, read: string, crossedOut = ''): Marked {
  const type = typeOf(kIn);
  const k = isOpen(type) ? kIn : { ...kIn, answer: keyCore(kIn.answer), type };
  if (type === 'fraction') return { ...markFraction(k, read, crossedOut), type };
  const coRaw = (crossedOut ?? '').trim();
  const co = coRaw && coRaw.replace(/\s+/g, '') !== (read ?? '').replace(/\s+/g, '') ? coRaw : '';
  const base: Marked = { q: k.q, read: read ?? '', crossedOut: co, status: 'blank', misconception: null, flags: co ? ['crossed_out'] : [], suggestions: [], type, outOf: outOfFor(k) };
  if (!(read ?? '').trim()) return base;
  if (isOpen(type)) return { ...base, status: 'pending' };
  if (type === 'number') {
    const v = markQuantity(keyCore(k.answer), read, k.tolerance ?? 0, k.prompt);
    // Nano sometimes adds a decimal point ("1200" read as "12.00"): a reading ending in ".00" is checked
    const zeroPoint = /\d\.0+(?!\d)/.test(read) && !/\.\d/.test(k.answer);
    const flags = [...base.flags, ...(v.status === 'unreadable' ? [/[a-z]{3,}/i.test(read) ? 'letters' as const : 'unreadable' as const] : v.status === 'wrong' && !v.mistake ? ['unusual' as const] : zeroPoint ? ['check_reading' as const] : [])];
    return { ...base, status: v.status, misconception: v.mistake, note: v.note, flags };
  }
  if (type === 'algebra') {
    const v = markAlgebra(keyCore(k.answer), read, k.prompt);
    return { ...base, status: v.status, misconception: v.mistake, flags: [...base.flags, ...(v.status === 'unreadable' ? ['unreadable' as const] : v.working ? ['check_reading' as const] : [])] };
  }
  if (type === 'choice') {
    const v = markChoice(k.answer, read, k.prompt);
    return { ...base, status: v.status, picked: v.picked ?? undefined, flags: [...base.flags, ...(v.two ? ['two_answers' as const] : v.status === 'unreadable' ? ['unreadable' as const] : [])] };
  }
  // word
  const v = markWord(keyCore(k.answer), read, !!k.spellingCounts);
  // Day-1 bench: Gemini Nano reads a misspelt word as the correct word ("necesary" → "necessary"), even
  // letter by letter. When spelling counts, a reading that equals the key is exactly that risk: ask.
  // A near spelling may be a different term (reflection for refraction): right, but the teacher looks.
  const autocorrectRisk = (!!k.spellingCounts && v.status === 'correct' && !v.mistake) || (v.status === 'correct' && v.mistake === 'spelling');
  return { ...base, status: v.status, misconception: v.mistake, note: v.mistake === 'spelling' && v.status === 'correct' ? `Spelling: ${v.closest}` : undefined, flags: [...base.flags, ...(v.extraWords ? ['extra_words' as const] : []), ...(autocorrectRisk ? ['check_spelling' as const] : []), ...(v.status === 'unreadable' ? ['unreadable' as const] : [])] };
}

function markFraction(k: QuestionKey, read: string, crossedOut = ''): Marked {
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
    // the part that isn't the crossed-out attempt is the likely final answer: offer it first
    suggestions.push(...[...p.parts].sort((a, b) => Number(a === co) - Number(b === co)));
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

export interface SheetScore { points: number; outOf: number; correct: number; unsimplified: number; partial: number; wrong: number; blank: number; unreadable: number; pending: number }

/** Points for one answer: the teacher's points on an open question, else from the status. */
export function pointsFor(m: Marked, halfCredit = 0.5): number {
  const out = m.outOf ?? 1;
  if (m.points !== undefined) return m.points;
  if (m.status === 'correct') return out;
  if (m.status === 'unsimplified' || m.status === 'partial') return halfCredit * out;
  return 0;
}

/**
 * Half-right answers (unsimplified fractions, a missing unit, 0.45 for 45%) earn `halfCredit`
 * (0, 0.5 or 1). Unreadable answers and open answers the teacher hasn't decided block the score.
 */
export function scoreSheet(marks: Marked[], halfCredit = 0.5): SheetScore {
  const s: SheetScore = { points: 0, outOf: 0, correct: 0, unsimplified: 0, partial: 0, wrong: 0, blank: 0, unreadable: 0, pending: 0 };
  for (const m of marks) {
    s[m.status]++;
    s.outOf += m.outOf ?? 1;
    s.points += pointsFor(m, halfCredit);
  }
  return s;
}

/** Status from points on an open question the teacher has decided. */
export const statusFromPoints = (points: number, outOf: number): Status => (points >= outOf ? 'correct' : points <= 0 ? 'wrong' : 'partial');

/** Questions worth a second, targeted on-device read. */
export function needsReread(k: QuestionKey, m: Marked): boolean {
  const type = typeOf(k);
  // open answers: the teacher reads the text against the photo anyway; only a missing answer gets a second look
  if (isOpen(type)) return m.status === 'blank';
  // a second read can't settle a spelling: the same model makes the same correction
  if (type !== 'fraction') return m.status === 'blank' || m.status === 'unreadable' || m.flags.some((f) => f !== 'check_spelling') || (m.status === 'wrong' && !m.misconception) || (m.status === 'partial');
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
