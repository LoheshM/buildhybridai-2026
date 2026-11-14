// Builds the ONLY payload that may leave the laptop for a real class: anonymous class totals.
// It is assembled from numbers and fixed vocabulary, never from free text, so it cannot hold a
// name by construction. validatePayload() re-checks the shape before anything is sent.
import { exprText, format, parseExpr } from '../marking/fraction';
import { keyInfo, type Marked, type QuestionKey } from '../marking/mark';
import { MISCONCEPTIONS, type MisconceptionId } from '../marking/misconceptions';

export const PAYLOAD_VERSION = 1;
export const MIN_SHEETS = 5;
export const LANGS = ['en', 'hi', 'ta'] as const;
export type Lang = (typeof LANGS)[number];

/** A count, or "hidden": a group smaller than k, or a cell that would let one be worked out. */
export type Cell = number | 'hidden';

export interface QuestionTotals {
  q: number;
  question: string; // rebuilt from numbers only, e.g. "2/3 + 1/6", or "" if not a fraction sum
  answer: string;
  right: Cell; // correct, simplified or not
  wrong: Cell;
  mistakes: Partial<Record<MisconceptionId | 'other', Cell>>;
}

export interface ClassTotals {
  v: typeof PAYLOAD_VERSION;
  topic: 'fractions';
  grade_band: '4-8';
  class_size: string; // a band such as "25-29", never the exact count
  k: number; // suppression threshold used
  questions: QuestionTotals[];
  note_languages: Lang[];
}

/**
 * The range an attacker who knows the rule can give each hidden cell. Hidden non-zero cells are
 * small (1..k-1) unless the residual cannot fit, and a hidden zero widens the floor to 0.
 * Exported for the property test.
 */
export function hiddenRange(values: number[], hidden: boolean[], k: number): [number, number] | null {
  const idx = hidden.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return null;
  const h = idx.length;
  const residual = idx.reduce((a, i) => a + values[i], 0);
  const lo = idx.some((i) => values[i] === 0) ? 0 : 1;
  const hi = residual <= h * (k - 1) ? k - 1 : residual;
  return [Math.max(lo, residual - (h - 1) * hi), Math.min(hi, residual - (h - 1) * lo)];
}

/**
 * Suppress cells in 1..k-1. When the row total is known and the small cells alone could be worked
 * out, the whole row is hidden (partial complementary hiding leaks through tie-breaks). If even an
 * all-hidden row would pin a value (three hidden cells summing to 3 are all 1), it returns null and
 * the row is withheld.
 */
export function suppressRow(values: number[], k: number, totalKnown: boolean): Cell[] | null {
  const hidden = values.map((v) => v > 0 && v < k);
  if (totalKnown) {
    const unsafe = () => {
      const r = hiddenRange(values, hidden, k);
      return !!r && (hidden.filter(Boolean).length === 1 || r[0] >= r[1]);
    };
    if (unsafe()) { hidden.fill(true); if (unsafe()) return null; }
  }
  return values.map((v, i) => (hidden[i] ? ('hidden' as const) : v));
}

/** Class size as a band, so no question row has a known exact total. */
export const sizeBand = (n: number) => { const lo = Math.floor(n / 5) * 5; return `${lo}-${lo + 4}`; };

export interface SheetMarks { marks: Marked[] }

export function buildTotals(keys: QuestionKey[], sheets: SheetMarks[], kIn: number, langs: Lang[]): ClassTotals {
  const k = Math.max(3, Math.floor(kIn || 3));
  const questions: QuestionTotals[] = keys.map((key): QuestionTotals => {
    const ms = sheets.map((s) => s.marks.find((m) => m.q === key.q)).filter((m): m is Marked => !!m);
    const c = { correct: 0, unsimplified: 0, wrong: 0, blank: 0, unreadable: 0 };
    const groups = new Map<MisconceptionId | 'other', number>();
    for (const m of ms) {
      c[m.status]++;
      if (m.status === 'wrong') { const g = m.misconception ?? 'other'; groups.set(g, (groups.get(g) ?? 0) + 1); }
    }
    // Right and wrong only, with no exact total: blanks and unreadable answers are not sent.
    const statusCells = suppressRow([c.correct + c.unsimplified, c.wrong], k, false)!;
    const gIds = [...groups.keys()];
    // The breakdown sums to the wrong count when that is shown, so it is checked for derivable cells.
    const gCells = gIds.length ? suppressRow(gIds.map((g) => groups.get(g)!), k, typeof statusCells[1] === 'number') : [];
    const mistakes: QuestionTotals['mistakes'] = {};
    if (gCells) gIds.forEach((g, i) => (mistakes[g] = gCells[i])); // an unsafe breakdown is left out
    const expr = parseExpr(key.prompt);
    return {
      q: key.q,
      question: expr ? exprText(expr) : '',
      answer: (() => { const v = keyInfo(key).value; return v ? format(v) : ''; })(), // rebuilt from the number, never the typed text
      right: statusCells[0], wrong: statusCells[1],
      mistakes,
    };
  });
  return { v: PAYLOAD_VERSION, topic: 'fractions', grade_band: '4-8', class_size: sizeBand(sheets.length), k, questions, note_languages: langs };
}

/** Keeps digits, spaces, "/", ".", "-" only. */
export const safeNumberText = (s: string) => (s ?? '').replace(/[^0-9 ./-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

/** A cell is 0, a count of at least k, or the suppression marker. Unsuppressed small counts are refused. */
const CELL = (c: unknown, k: number) => (typeof c === 'number' && Number.isInteger(c) && (c === 0 || (c >= k && c < 10000))) || c === 'hidden';
const MATH = /^[0-9 ./+×÷-]{0,40}$/;

/** Strict allowlist validation of the outbound payload. Throws on anything unexpected. */
export function validatePayload(p: unknown, minK = 3): asserts p is ClassTotals {
  const fail = (why: string) => { throw new Error(`Blocked: class totals failed validation (${why})`); };
  if (!p || typeof p !== 'object') fail('not an object');
  const o = p as Record<string, unknown>;
  const allowed = ['v', 'topic', 'grade_band', 'class_size', 'k', 'questions', 'note_languages'];
  for (const key of Object.keys(o)) if (!allowed.includes(key)) fail(`unexpected field ${key}`);
  if (o.v !== PAYLOAD_VERSION || o.topic !== 'fractions' || o.grade_band !== '4-8') fail('header');
  const k = o.k as number;
  if (!Number.isInteger(k) || k < Math.max(3, minK)) fail('k');
  if (typeof o.class_size !== 'string' || !/^\d{1,3}-\d{1,3}$/.test(o.class_size) || Number(o.class_size.split('-')[0]) < MIN_SHEETS) fail(`fewer than ${MIN_SHEETS} sheets`);
  if (!Array.isArray(o.note_languages) || !o.note_languages.every((l) => (LANGS as readonly string[]).includes(l as string))) fail('languages');
  if (!Array.isArray(o.questions) || o.questions.length > 40) fail('questions');
  const qKeys = ['q', 'question', 'answer', 'right', 'wrong', 'mistakes'];
  const mKeys = [...Object.keys(MISCONCEPTIONS), 'other'];
  for (const q of o.questions as Record<string, unknown>[]) {
    for (const key of Object.keys(q)) if (!qKeys.includes(key)) fail(`unexpected question field ${key}`);
    if (!Number.isInteger(q.q)) fail('q');
    if (typeof q.question !== 'string' || !MATH.test(q.question)) fail('question text');
    if (typeof q.answer !== 'string' || !MATH.test(q.answer)) fail('answer text');
    for (const c of ['right', 'wrong']) if (!CELL(q[c], k)) fail(`cell ${c}`);
    const ms = q.mistakes as Record<string, unknown>;
    if (!ms || typeof ms !== 'object') fail('mistakes');
    for (const [mk, mv] of Object.entries(ms)) { if (!mKeys.includes(mk)) fail(`mistake ${mk}`); if (!CELL(mv, k)) fail('mistake cell'); }
  }
}
