import { MISTAKES } from '../marking/mistakes';
// Plain JSON Schemas used unchanged on both sides: Chrome's `responseConstraint` (on-device)
// and Gemini's `responseJsonSchema` (cloud). Keep to keywords both accept; validate in code.

/**
 * v2 sheet schema: one REQUIRED field per question (q1..qN). With an array, Gemini Nano often
 * stopped early and dropped the last questions; constrained decoding can't skip a required field.
 */
export function sheetSchema(n: number) {
  const item = { type: 'object', properties: { crossedOut: { type: 'string' }, answer: { type: 'string' } }, required: ['crossedOut', 'answer'] };
  const props: Record<string, object> = { studentName: { type: 'string' } };
  for (let i = 1; i <= n; i++) props[`q${i}`] = item;
  return { type: 'object', properties: props, required: Object.keys(props) };
}

/** Suggested mark for a short answer with N key points. */
export function shortSuggestSchema(n: number) {
  return {
    type: 'object',
    // order matters: the mark first agreed best with human markers (probe prod2, docs/research/06)
    properties: {
      mark: { type: 'string', enum: ['full', 'partial', 'none'] },
      missing: { type: 'array', items: { type: 'integer', enum: Array.from({ length: n }, (_, i) => i + 1) } },
      reason: { type: 'string' },
    },
    required: ['mark', 'missing', 'reason'],
  };
}

/** Suggested rubric scores for a paragraph: one bounded integer per rubric line. */
export function passageSuggestSchema(max: number[]) {
  const props: Record<string, object> = {};
  max.forEach((m, i) => { props[`l${i + 1}`] = { type: 'integer', enum: Array.from({ length: m + 1 }, (_, v) => v) }; });
  props.reason = { type: 'string' };
  return { type: 'object', properties: props, required: Object.keys(props) };
}

/** What the model returns (kept raw in recordings; code turns it into a Suggestion). */
export type RawSuggestion = { missing?: number[]; mark?: string; reason?: string } & Record<string, unknown>;

/** v1 shape, kept for the recorded v1 readings and the second read. */
export const SHEET_SCHEMA = {
  type: 'object',
  properties: {
    studentName: { type: 'string' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { q: { type: 'integer' }, crossedOutText: { type: 'string' }, finalAnswer: { type: 'string' } },
        required: ['q', 'crossedOutText', 'finalAnswer'],
      },
    },
  },
  required: ['studentName', 'answers'],
} as const;

export const REREAD_SCHEMA = {
  type: 'object',
  properties: {
    answers: {
      type: 'array',
      items: { type: 'object', properties: { q: { type: 'integer' }, crossedOutText: { type: 'string' }, finalAnswer: { type: 'string' } }, required: ['q', 'crossedOutText', 'finalAnswer'] },
    },
  },
  required: ['answers'],
} as const;

/** Every group a parent note can be written for (mistake patterns plus the general groups). */
export const NOTE_GROUPS: readonly string[] = [...Object.keys(MISTAKES), 'other', 'secure', 'default'];

const practiceItem = { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' } }, required: ['question', 'answer'] };
const planSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    focus: { type: 'string' },
    minutes: { type: 'integer' },
    steps: { type: 'array', items: { type: 'object', properties: { minutes: { type: 'integer' }, teacher: { type: 'string' }, students: { type: 'string' } }, required: ['minutes', 'teacher', 'students'] } },
    hingeQuestion: { type: 'object', properties: { question: { type: 'string' }, answer: { type: 'string' }, ifWrong: { type: 'string' } }, required: ['question', 'answer', 'ifWrong'] },
    practice: {
      type: 'object',
      properties: { support: { type: 'array', items: practiceItem }, core: { type: 'array', items: practiceItem }, stretch: { type: 'array', items: practiceItem } },
      required: ['support', 'core', 'stretch'],
    },
  },
  required: ['title', 'focus', 'minutes', 'steps', 'hingeQuestion', 'practice'],
};

const notesSchema = (langs: readonly string[]) => ({
  type: 'array',
  items: {
    type: 'object',
    properties: {
      group: { type: 'string', enum: [...NOTE_GROUPS] },
      language: { type: 'string', enum: [...langs] },
      text: { type: 'string' },
    },
    required: ['group', 'language', 'text'],
  },
});

/** Cloud: full plan plus parent-note templates in every requested language. */
export const TOTALS_SCHEMA_CLOUD = { type: 'object', properties: { plan: planSchema, notes: notesSchema(['en', 'hi', 'ta']) }, required: ['plan', 'notes'] };
/** On-device fallback: Gemini Nano writes English only, so the notes are English. */
export const TOTALS_SCHEMA_DEVICE = { type: 'object', properties: { plan: planSchema, notes: notesSchema(['en']) }, required: ['plan', 'notes'] };

export interface SheetRead { studentName: string; answers: { q: number; crossedOutText: string; finalAnswer: string }[] }
export interface PracticeItem { question: string; answer: string }
export interface ReteachPlan {
  title: string; focus: string; minutes: number;
  steps: { minutes: number; teacher: string; students: string }[];
  hingeQuestion: { question: string; answer: string; ifWrong: string };
  practice: { support: PracticeItem[]; core: PracticeItem[]; stretch: PracticeItem[] };
}
export interface NoteTemplate { group: string; language: string; text: string }
export interface TotalsResponse { plan: ReteachPlan; notes: NoteTemplate[] }

/** Strict runtime validation of a sheet read (the model can return odd shapes). Throws SyntaxError if unusable. */
export function coerceSheetRead(x: unknown, questionCount: number): SheetRead {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  // v2 shape {q1: {crossedOut, answer}, ...} → the v1 list shape used everywhere else
  if (!Array.isArray(o.answers) && Object.keys(o).some((k) => /^q\d+$/.test(k))) {
    o.answers = Object.entries(o).filter(([k]) => /^q\d+$/.test(k)).map(([k, v]) => {
      const a = (v && typeof v === 'object' ? v : { answer: v }) as Record<string, unknown>;
      return { q: Number(k.slice(1)), crossedOutText: a.crossedOut ?? a.crossedOutText ?? '', finalAnswer: a.answer ?? a.finalAnswer ?? '' };
    });
  }
  const raw = (Array.isArray(o.answers) ? o.answers : []) as Record<string, unknown>[];
  // answers can be paragraphs now: keep up to 1200 characters (a 6-line passage is ~500)
  const str = (v: unknown, max = 1200) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\s+/g, ' ').trim().slice(0, max) : '');
  const qOf = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : typeof v === 'string' && /^\s*\d+\s*$/.test(v) ? Number(v) : NaN);
  let items = raw.map((a) => ({ q: qOf(a?.q), crossedOutText: str(a?.crossedOutText), finalAnswer: str(a?.finalAnswer) })).filter((a) => Number.isInteger(a.q));
  if (raw.length > 0 && items.length === 0) throw new SyntaxError('The reading had no usable question numbers.');
  // 0-based numbering: shift when q:0 is present and the last question is missing
  const zero = items.find((a) => a.q === 0);
  if (zero && !/\d/.test(zero.finalAnswer) && zero.finalAnswer !== '') items = items.filter((a) => a !== zero); // e.g. the name read as q:0
  else if (zero && items.every((a) => a.q >= 0 && a.q < questionCount)) items = items.map((a) => ({ ...a, q: a.q + 1 }));
  const byQ = new Map<number, { q: number; crossedOutText: string; finalAnswer: string }>();
  for (const a of items) {
    if (a.q < 1 || a.q > questionCount) continue;
    const prev = byQ.get(a.q);
    if (!prev) byQ.set(a.q, a);
    else if (a.finalAnswer && a.finalAnswer !== prev.finalAnswer) byQ.set(a.q, { ...prev, finalAnswer: [prev.finalAnswer, a.finalAnswer].filter(Boolean).join(' ') }); // surfaces as "Two answers"
  }
  const answers = Array.from({ length: questionCount }, (_, i) => byQ.get(i + 1) ?? { q: i + 1, crossedOutText: '', finalAnswer: '' });
  return { studentName: str(o.studentName).slice(0, 60), answers };
}
