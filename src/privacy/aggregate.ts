// Builds the ONLY payload that may leave the laptop for a real class: anonymous class totals.
// It holds counts, fixed vocabulary (question types, mistake ids, option letters) and the
// teacher's own key. Never a student's answer, name or photo: student text is not an input here.
// validatePayload() re-checks the shape before anything is sent, and the network guard scans the
// final request for any name on the class list.
import { exprText, format, parseExpr } from '../marking/fraction';
import { keyInfo, typeOf, type Marked, type QuestionKey } from '../marking/mark';
import { MISTAKES, type MistakeId } from '../marking/mistakes';
import { parseQuantity } from '../marking/numeric';
import { keyPoints, parseRubric, QTYPES, type QType } from '../marking/qtypes';
import { normChoice } from '../marking/words';
import { findRosterNames } from './nameCheck';

export const PAYLOAD_VERSION = 2;
export const MIN_SHEETS = 5;
export const LANGS = ['en', 'hi', 'ta'] as const;
export type Lang = (typeof LANGS)[number];
export const SUBJECTS = ['maths', 'science', 'english', 'other'] as const;
export type Subject = (typeof SUBJECTS)[number];
export const GRADE_BANDS = ['4-6', '7-9', '10-12'] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];
const OPTIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'true', 'false'] as const;

/** A count, or "hidden": a group smaller than k, or a cell that would let one be worked out. */
export type Cell = number | 'hidden';

export interface QuestionTotals {
  q: number;
  type: QType;
  question: string; // maths: rebuilt from numbers ("2/3 + 1/6"); otherwise the teacher's printed question
  answer: string; // the teacher's key (numbers rebuilt from their value)
  key_points?: string[]; // short answers: the teacher's key points
  rubric?: string[]; // paragraphs: the teacher's rubric lines
  right: Cell; // full marks
  partial: Cell; // some marks
  wrong: Cell; // no marks
  mistakes: Partial<Record<MistakeId | 'other', Cell>>;
  wrong_options?: Partial<Record<(typeof OPTIONS)[number], Cell>>; // multiple choice: wrong answers by option picked
}

export interface ClassTotals {
  v: typeof PAYLOAD_VERSION;
  subject: Subject;
  grade_band: GradeBand;
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

/**
 * The published cells for one question. Right, partial and wrong are shown when at least k,
 * otherwise hidden. A breakdown is published only when the counts it splits are all shown, and is
 * fully hidden or withheld when a small group could be worked out from it (the breakdown is
 * treated as if its total were known, even for labels that overlap, which is the stricter case).
 */
export function questionCells(right: number, partial: number, wrong: number, groups: [string, number][], k: number): { right: Cell; partial: Cell; wrong: Cell; mistakes: Record<string, Cell> } {
  const [r, p, w] = suppressRow([right, partial, wrong], k, false)!;
  const mistakes: Record<string, Cell> = {};
  if (typeof w === 'number' && typeof p === 'number' && groups.length) {
    const cells = suppressRow(groups.map(([, n]) => n), k, true);
    if (cells) groups.forEach(([g], i) => (mistakes[g] = cells[i]));
  }
  return { right: r, partial: p, wrong: w, mistakes };
}

export interface SheetMarks { marks: Marked[] }

/** Teacher-written key text: one line, printable, capped. Never student text. */
export function teacherText(s: string, max = 160): string {
  return (s ?? '').normalize('NFKC').replace(/[\p{C}]/gu, ' ').replace(/[<>{}[\]\\`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

const MATHS: QType[] = ['fraction', 'number', 'algebra'];
export const subjectFor = (keys: QuestionKey[]): Subject => (keys.every((k) => MATHS.includes(typeOf(k))) ? 'maths' : 'other');

/** Rebuilt from the number, never the typed text, for maths keys. */
function keyText(k: QuestionKey, type: QType): string {
  if (type === 'fraction') { const v = keyInfo(k).value; return v ? format(v) : ''; }
  if (type === 'number') {
    const q = parseQuantity(k.answer);
    if (!q) return '';
    const v = q.decimals > 0 ? (q.value.n / q.value.d).toFixed(q.decimals) : format(q.value); // 3.6 g stays 3.6, never 3 3/5
    return `${v}${q.percent ? '%' : q.unit ? ` ${q.unit}` : ''}`.replace(/^(.*) ([$£€₹])$/, '$2$1');
  }
  if (type === 'choice') return normChoice(k.answer) ?? '';
  if (type === 'short' || type === 'passage') return '';
  return teacherText(k.answer, 80);
}

/** Class size is deliberately not sent: even a band would bound hidden counts. Callers check MIN_SHEETS locally. */
export function buildTotals(keys: QuestionKey[], sheets: SheetMarks[], kIn: number, langs: Lang[], meta: { subject?: Subject; grade_band?: GradeBand; rosterTokens?: string[] } = {}): ClassTotals {
  const k = Math.max(3, Math.floor(kIn || 3));
  // Layer 1: teacher text that mentions anyone on the class list is left out (the guard is layer 2).
  const named = (s: string) => !!meta.rosterTokens?.length && findRosterNames(s, meta.rosterTokens).length > 0;
  const tt = (s: string, max?: number) => { const t = teacherText(s, max); return named(t) ? '' : t; };
  const questions: QuestionTotals[] = keys.map((key): QuestionTotals => {
    const type = typeOf(key);
    const ms = sheets.map((s) => s.marks.find((m) => m.q === key.q)).filter((m): m is Marked => !!m);
    let right = 0, partial = 0, wrong = 0;
    const groups = new Map<string, number>();
    const options = new Map<string, number>();
    const bump = (m: Map<string, number>, g: string) => m.set(g, (m.get(g) ?? 0) + 1);
    for (const m of ms) {
      // undecided open answers, blanks and unreadable answers are not counted
      if (m.status === 'correct' || m.status === 'unsimplified') right++;
      else if (m.status === 'partial') partial++;
      else if (m.status === 'wrong') wrong++;
      else continue;
      if (m.status === 'correct' || m.status === 'unsimplified') continue;
      if (type === 'choice') { if (m.picked) bump(options, m.picked); continue; }
      const labels = m.mistakes?.length ? m.mistakes : m.misconception ? [m.misconception] : ['other'];
      for (const g of labels) bump(groups, g);
    }
    const cells = questionCells(right, partial, wrong, [...groups.entries()], k);
    const expr = type === 'fraction' ? parseExpr(key.prompt) : null;
    const q: QuestionTotals = {
      q: key.q,
      type,
      question: expr ? exprText(expr) : MATHS.includes(type) ? '' : tt(key.prompt),
      answer: named(keyText(key, type)) ? '' : keyText(key, type),
      right: cells.right, partial: cells.partial, wrong: cells.wrong,
      mistakes: cells.mistakes as QuestionTotals['mistakes'],
    };
    if (type === 'short') q.key_points = keyPoints(key.answer).map((p) => tt(p, 80));
    if (type === 'passage') q.rubric = (parseRubric(key.answer) ?? []).map((l) => tt(`${l.line} (${l.max})`, 60));
    if (type === 'choice' && typeof cells.wrong === 'number' && options.size) {
      const entries = [...options.entries()];
      const oc = suppressRow(entries.map(([, n]) => n), k, true);
      if (oc) q.wrong_options = Object.fromEntries(entries.map(([o], i) => [o, oc[i]]));
    }
    return q;
  });
  return { v: PAYLOAD_VERSION, subject: meta.subject ?? subjectFor(keys), grade_band: meta.grade_band ?? '7-9', k, questions, note_languages: langs };
}

/** Keeps digits, spaces, "/", ".", "-" only. */
export const safeNumberText = (s: string) => (s ?? '').replace(/[^0-9 ./-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);

/** A cell is 0, a count of at least k, or the suppression marker. Unsuppressed small counts are refused. */
const CELL = (c: unknown, k: number) => (typeof c === 'number' && Number.isInteger(c) && (c === 0 || (c >= k && c < 10000))) || c === 'hidden';
/** Maths question text is rebuilt from numbers only; maths answers may add a unit, a % or single-letter variables. */
const MATH_Q = /^[0-9 ./+×÷-]{0,40}$/;
const MATH_A = /^(?:[0-9 ./+×÷%$£€₹²³°=()^*-]|(?<![a-zA-Z])[a-zA-Z](?![a-zA-Z])|(?:mm|cm|km|kg|ml|min|km\/h|m\/s|mph))*$/;
/** Teacher text: letters, digits, spaces and ordinary punctuation, one line. */
const TEXT = /^[\p{L}\p{M}\p{N}\p{Zs} .,;:!?'’"“”()%°£$€₹+×÷=/&-]{0,160}$/u;

/** Strict allowlist validation of the outbound payload. Throws on anything unexpected. */
export function validatePayload(p: unknown, minK = 3): asserts p is ClassTotals {
  const fail = (why: string) => { throw new Error(`Blocked: class totals failed validation (${why})`); };
  if (!p || typeof p !== 'object') fail('not an object');
  const o = p as Record<string, unknown>;
  const allowed = ['v', 'subject', 'grade_band', 'k', 'questions', 'note_languages'];
  for (const key of Object.keys(o)) if (!allowed.includes(key)) fail(`unexpected field ${key}`);
  if (o.v !== PAYLOAD_VERSION || !(SUBJECTS as readonly unknown[]).includes(o.subject) || !(GRADE_BANDS as readonly unknown[]).includes(o.grade_band)) fail('header');
  const k = o.k as number;
  if (!Number.isInteger(k) || k < Math.max(3, minK)) fail('k');
  if (!Array.isArray(o.note_languages) || !o.note_languages.every((l) => (LANGS as readonly string[]).includes(l as string))) fail('languages');
  if (!Array.isArray(o.questions) || o.questions.length > 40) fail('questions');
  const qKeys = ['q', 'type', 'question', 'answer', 'key_points', 'rubric', 'right', 'partial', 'wrong', 'mistakes', 'wrong_options'];
  const mKeys = [...Object.keys(MISTAKES), 'other'];
  for (const q of o.questions as Record<string, unknown>[]) {
    for (const key of Object.keys(q)) if (!qKeys.includes(key)) fail(`unexpected question field ${key}`);
    if (!Number.isInteger(q.q)) fail('q');
    if (typeof q.type !== 'string' || !(q.type in QTYPES)) fail('type');
    const maths = MATHS.includes(q.type as QType);
    if (typeof q.question !== 'string' || !(maths ? MATH_Q : TEXT).test(q.question)) fail('question text');
    if (typeof q.answer !== 'string' || q.answer.length > 40 || !(maths ? MATH_A : TEXT).test(q.answer)) fail('answer text');
    for (const f of ['key_points', 'rubric'] as const) {
      if (q[f] === undefined) continue;
      if (!Array.isArray(q[f]) || (q[f] as unknown[]).length > 6 || !(q[f] as unknown[]).every((x) => typeof x === 'string' && TEXT.test(x) && x.length <= 80)) fail(f);
    }
    for (const c of ['right', 'partial', 'wrong']) if (!CELL(q[c], k)) fail(`cell ${c}`);
    const ms = q.mistakes as Record<string, unknown>;
    if (!ms || typeof ms !== 'object' || Array.isArray(ms)) fail('mistakes');
    for (const [mk, mv] of Object.entries(ms)) { if (!mKeys.includes(mk)) fail(`mistake ${mk}`); if (!CELL(mv, k)) fail('mistake cell'); }
    if (q.wrong_options !== undefined) {
      const wo = q.wrong_options as Record<string, unknown>;
      if (!wo || typeof wo !== 'object' || Array.isArray(wo)) fail('wrong_options');
      for (const [ok, ov] of Object.entries(wo)) { if (!(OPTIONS as readonly string[]).includes(ok)) fail(`option ${ok}`); if (!CELL(ov, k)) fail('option cell'); }
    }
  }
}
