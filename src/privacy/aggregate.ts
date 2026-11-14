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
  correct: Cell;
  unsimplified: Cell;
  wrong: Cell;
  blank: Cell;
  unreadable: Cell;
  mistakes: Partial<Record<MisconceptionId | 'other', Cell>>;
}

export interface ClassTotals {
  v: typeof PAYLOAD_VERSION;
  topic: 'fractions';
  grade_band: '4-8';
  sheets: number;
  k: number; // suppression threshold used
  questions: QuestionTotals[];
  note_languages: Lang[];
}

/**
 * Suppress cells in 1..k-1. When the row total is known, keep hiding more cells until no hidden
 * cell can be worked out: a single hidden cell equals the residual, and h hidden non-zero cells
 * summing to exactly h must each be 1. Visible non-zero cells are hidden first (smallest first),
 * then zero cells, so that an attacker can no longer assume every hidden cell is at least 1.
 */
export function suppressRow(values: number[], k: number, totalKnown: boolean): Cell[] {
  const hidden = values.map((v) => v > 0 && v < k);
  if (totalKnown) {
    const unsafe = () => {
      const idx = hidden.map((h, i) => (h ? i : -1)).filter((i) => i >= 0);
      if (idx.length === 0) return false;
      const residual = idx.reduce((a, i) => a + values[i], 0);
      const zeroHidden = idx.some((i) => values[i] === 0);
      return idx.length === 1 || (!zeroHidden && residual === idx.length);
    };
    while (unsafe()) {
      let next = -1;
      values.forEach((v, i) => { if (!hidden[i] && v > 0 && (next < 0 || v < values[next])) next = i; });
      if (next < 0) next = values.findIndex((v, i) => !hidden[i] && v === 0);
      if (next < 0) break;
      hidden[next] = true;
    }
  }
  return values.map((v, i) => (hidden[i] ? ('hidden' as const) : v));
}

export interface SheetMarks { marks: Marked[] }

export function buildTotals(keys: QuestionKey[], sheets: SheetMarks[], kIn: number, langs: Lang[]): ClassTotals {
  const k = Math.max(3, Math.floor(kIn || 3));
  const questions: QuestionTotals[] = keys.map((key) => {
    const ms = sheets.map((s) => s.marks.find((m) => m.q === key.q)).filter((m): m is Marked => !!m);
    const c = { correct: 0, unsimplified: 0, wrong: 0, blank: 0, unreadable: 0 };
    const groups = new Map<MisconceptionId | 'other', number>();
    for (const m of ms) {
      c[m.status]++;
      if (m.status === 'wrong') { const g = m.misconception ?? 'other'; groups.set(g, (groups.get(g) ?? 0) + 1); }
    }
    const statusCells = suppressRow([c.correct, c.unsimplified, c.wrong, c.blank, c.unreadable], k, true);
    const gIds = [...groups.keys()];
    const gCells = suppressRow(gIds.map((g) => groups.get(g)!), k, typeof statusCells[2] === 'number');
    const mistakes: QuestionTotals['mistakes'] = {};
    gIds.forEach((g, i) => (mistakes[g] = gCells[i]));
    const expr = parseExpr(key.prompt);
    return {
      q: key.q,
      question: expr ? exprText(expr) : '',
      answer: (() => { const v = keyInfo(key).value; return v ? format(v) : ''; })(), // rebuilt from the number, never the typed text
      correct: statusCells[0], unsimplified: statusCells[1], wrong: statusCells[2], blank: statusCells[3], unreadable: statusCells[4],
      mistakes,
    };
  });
  return { v: PAYLOAD_VERSION, topic: 'fractions', grade_band: '4-8', sheets: sheets.length, k, questions, note_languages: langs };
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
  const allowed = ['v', 'topic', 'grade_band', 'sheets', 'k', 'questions', 'note_languages'];
  for (const key of Object.keys(o)) if (!allowed.includes(key)) fail(`unexpected field ${key}`);
  if (o.v !== PAYLOAD_VERSION || o.topic !== 'fractions' || o.grade_band !== '4-8') fail('header');
  const k = o.k as number;
  if (!Number.isInteger(k) || k < Math.max(3, minK)) fail('k');
  if (!Number.isInteger(o.sheets) || (o.sheets as number) < MIN_SHEETS) fail(`fewer than ${MIN_SHEETS} sheets`);
  if (!Array.isArray(o.note_languages) || !o.note_languages.every((l) => (LANGS as readonly string[]).includes(l as string))) fail('languages');
  if (!Array.isArray(o.questions) || o.questions.length > 40) fail('questions');
  const qKeys = ['q', 'question', 'answer', 'correct', 'unsimplified', 'wrong', 'blank', 'unreadable', 'mistakes'];
  const mKeys = [...Object.keys(MISCONCEPTIONS), 'other'];
  for (const q of o.questions as Record<string, unknown>[]) {
    for (const key of Object.keys(q)) if (!qKeys.includes(key)) fail(`unexpected question field ${key}`);
    if (!Number.isInteger(q.q)) fail('q');
    if (typeof q.question !== 'string' || !MATH.test(q.question)) fail('question text');
    if (typeof q.answer !== 'string' || !MATH.test(q.answer)) fail('answer text');
    for (const c of ['correct', 'unsimplified', 'wrong', 'blank', 'unreadable']) if (!CELL(q[c], k)) fail(`cell ${c}`);
    const ms = q.mistakes as Record<string, unknown>;
    if (!ms || typeof ms !== 'object') fail('mistakes');
    for (const [mk, mv] of Object.entries(ms)) { if (!mKeys.includes(mk)) fail(`mistake ${mk}`); if (!CELL(mv, k)) fail('mistake cell'); }
  }
}
