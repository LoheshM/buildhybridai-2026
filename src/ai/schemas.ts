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
      items: { type: 'object', properties: { q: { type: 'integer' }, finalAnswer: { type: 'string' } }, required: ['q', 'finalAnswer'] },
    },
  },
  required: ['answers'],
} as const;

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
      group: { type: 'string' },
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

/** Light runtime validation of a sheet read (the model can return odd shapes). */
export function coerceSheetRead(x: unknown, questionCount: number): SheetRead {
  const o = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
  const raw = Array.isArray(o.answers) ? o.answers : [];
  const byQ = new Map<number, { q: number; crossedOutText: string; finalAnswer: string }>();
  for (const a of raw as Record<string, unknown>[]) {
    const q = Number(a?.q);
    if (!Number.isInteger(q) || q < 1 || q > questionCount || byQ.has(q)) continue;
    byQ.set(q, { q, crossedOutText: String(a.crossedOutText ?? '').slice(0, 40), finalAnswer: String(a.finalAnswer ?? '').slice(0, 40) });
  }
  const answers = Array.from({ length: questionCount }, (_, i) => byQ.get(i + 1) ?? { q: i + 1, crossedOutText: '', finalAnswer: '' });
  return { studentName: String(o.studentName ?? '').slice(0, 60), answers };
}
