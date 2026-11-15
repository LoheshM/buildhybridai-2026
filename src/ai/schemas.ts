// Plain JSON Schemas used unchanged on both sides: Chrome's `responseConstraint` (on-device)
// and Gemini's `responseJsonSchema` (cloud). Keep to keywords both accept; validate in code.

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
export const NOTE_GROUPS = ['add_across', 'numerators_only', 'denominators_multiplied', 'whole_dropped', 'cross_multiply', 'no_invert', 'flipped_first', 'reversed_subtraction', 'wrong_operation', 'slip', 'other', 'secure', 'default'] as const;

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
  const raw = (Array.isArray(o.answers) ? o.answers : []) as Record<string, unknown>[];
  const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 40) : '');
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
