import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markAnswer, type QuestionKey } from '../marking/mark';
import { buildTotals, suppressRow, validatePayload, type Cell } from './aggregate';
import { findRosterNames, rosterTokens, stringValues } from './nameCheck';
import { csvCell, fillTemplate, validTemplate } from './templates';

const m = JSON.parse(readFileSync(new URL('../../public/samples/manifest.json', import.meta.url), 'utf8'));
const keys: QuestionKey[] = m.quiz.questions.map((q: { q: number; prompt: string; key: string }) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
const sheets = m.students.map((s: { answers: { q: number; written: string }[] }) => ({ marks: s.answers.map((a) => markAnswer(keys[a.q - 1], a.written)) }));
const names: string[] = m.students.map((s: { name: string }) => s.name);

describe('suppressRow', () => {
  it('hides small counts', () => {
    expect(suppressRow([20, 1, 7, 0], 3, false)).toEqual([20, '<3', 7, 0]);
  });
  it('hides a second cell when the row total would reveal the first', () => {
    expect(suppressRow([20, 1, 7, 0], 3, true)).toEqual([20, '<3', '<3', 0]);
  });
  it('property: with a known total, a hidden cell is never derivable (never exactly one hidden)', () => {
    for (let t = 0; t < 2000; t++) {
      const row = Array.from({ length: 2 + (t % 5) }, (_, i) => (t * 7919 + i * 104729) % 9);
      const k = 3 + (t % 3);
      const out = suppressRow(row, k, true);
      const hidden = out.filter((c) => typeof c === 'string').length;
      expect(hidden === 0 || hidden >= 2 || out.every((c, i) => typeof c === 'string' || row[i] === 0)).toBe(true);
      out.forEach((c, i) => { if (typeof c === 'number') expect(c === 0 || c >= k || false).toBe(row[i] === 0 || row[i] >= k); });
    }
  });
});

describe('class totals payload', () => {
  const p = buildTotals(keys, sheets, 3, ['en', 'hi']);
  it('passes strict validation and holds no roster word', () => {
    validatePayload(p);
    const text = JSON.stringify(p);
    expect(findRosterNames(text, rosterTokens(names))).toEqual([]);
    expect(stringValues(p).every((v) => /^[0-9a-z <./+×÷_-]*$/.test(v))).toBe(true);
  });
  it('counts add up and small cells are hidden', () => {
    const q2 = p.questions.find((q) => q.q === 2)!;
    expect(q2.question).toBe('2/3 + 1/6');
    const cells: Cell[] = [q2.correct, q2.unsimplified, q2.wrong, q2.blank, q2.unreadable];
    for (const c of cells) if (typeof c === 'number') expect(c === 0 || c >= 3).toBe(true);
    expect(typeof q2.mistakes.add_across).toBe('number');
  });
  it('rejects extra fields, free text, small classes and bad cells', () => {
    expect(() => validatePayload({ ...p, teacher_note: 'Meera struggles' })).toThrow(/unexpected field/);
    expect(() => validatePayload({ ...p, sheets: 4 })).toThrow(/fewer than 5/);
    const bad = structuredClone(p); bad.questions[0].question = 'Meera + 1/2';
    expect(() => validatePayload(bad)).toThrow(/question text/);
    const bad2 = structuredClone(p); (bad2.questions[0] as unknown as Record<string, unknown>).correct = 2;
    expect(() => validatePayload(bad2)).toThrow(/cell/);
    const bad3 = structuredClone(p); (bad3.questions[0].mistakes as Record<string, unknown>).meera = 4;
    expect(() => validatePayload(bad3)).toThrow(/mistake/);
  });
  it('teacher-typed prompts with names are rebuilt from numbers or dropped', () => {
    const q = buildTotals([{ q: 1, prompt: "Meera's question: 1/2 + 1/4", answer: '3/4 (Meera)' }], sheets.slice(0, 6), 3, ['en']);
    expect(q.questions[0].question).toBe('');
    expect(q.questions[0].answer).toBe('3/4');
    validatePayload(q);
  });
});

describe('name check', () => {
  const tokens = rosterTokens(['Hope Mathew', 'Mark Lee', 'मीरा शर्मा', 'Zoë Ng', 'Other Kid']);
  it.each([
    ['Please help Hope with fractions', ['hope']],
    ['hopefully better', []],
    ['MARK the answers', ['mark']],
    ['Zoe did well', ['zoe']],
    ['मीरा ने अच्छा किया', ['मीरा']],
    ['other: 4', []],
    ['roll 14 scored 7', []],
  ])('%s', (text, expected) => {
    expect(findRosterNames(text, tokens).map((h) => h.token).sort()).toEqual([...expected].sort());
  });
});

describe('templates and CSV', () => {
  it('validates placeholders', () => {
    expect(validTemplate('Dear parent of {{student}}, {{score}}/{{total}}')).toBe(true);
    expect(validTemplate('प्रिय अभिभावक, {{ student }} ने {{score}} अंक पाए')).toBe(true);
    expect(validTemplate('Dear parent, score {{score}}')).toBe(false); // no student placeholder
    expect(validTemplate('Hi {{student}} {{teacher}}')).toBe(false); // unknown placeholder
    expect(validTemplate('{{छात्र}} ...')).toBe(false);
  });
  it('fills as plain text', () => {
    expect(fillTemplate('{{student}}: {{score}}/{{total}}', { student: '<b>Aarav</b>', score: 7, total: 10 })).toBe('<b>Aarav</b>: 7/10');
  });
  it('guards spreadsheet formulas', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('Aarav Shah')).toBe('Aarav Shah');
    expect(csvCell(7)).toBe('7');
  });
});
