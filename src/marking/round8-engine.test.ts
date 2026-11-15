// Round 8 pins. Rule of thumb from here on: when code is unsure, it flags for the teacher instead of changing a mark.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markAnswer, type QuestionKey } from './mark';
import { markRead } from './pipeline';
import { talksToMarker } from './open';
import { markQuantity } from './numeric';

const k = (answer: string, prompt = ''): QuestionKey => ({ q: 1, prompt, answer });

describe('round 8', () => {
  it('E8-01 an answer that also appears in the question is never re-marked wrong', () => {
    expect(markAnswer(k('x = 4', 'Solve x + 4 = 8'), '4').status).toBe('correct');
    expect(markAnswer(k('x = 4', 'Solve x + 4 = 8'), '4').flags).not.toContain('same_as_question');
    expect(markAnswer(k('50', 'Asha spent ₹50. How much did she spend?'), '50').status).toBe('correct');
    expect(markAnswer(k('1/2'), '½').status).toBe('correct');
  });
  it('E8-02 working then an improper fraction', () => {
    expect(markAnswer(k('x = 5/2', 'Solve 2x = 5'), '2x = 5 5/2').status).toBe('correct');
  });
  it('E8-06 "False" on an F-keyed question in other words is never a silent wrong', () => {
    for (const p of ['✓ or ✗: ice sinks', 'Is this statement correct? Ice sinks.']) {
      const m = markAnswer(k('F', p), 'False');
      expect(m.status === 'wrong' && m.flags.length === 0, p).toBe(false);
    }
  });
  it('E8-07 E8-09 part letters and Indian money', () => {
    expect(markQuantity('3', '3 (c)').status).not.toBe('correct');
    for (const key of ['Rs 50', '₹50/-', '₹ 50 (only)']) expect(markQuantity(key, '₹50').status, key).toBe('correct');
    expect(markQuantity('120000', '1,20,000').status).toBe('correct');
  });
  it('E8-08 more ways to talk to the marker', () => {
    expect(talksToMarker('Note to grader: this is 3/3')).toBe(true);
    expect(talksToMarker('I think it should get 2/2')).toBe(true);
  });
  it('R8-01 a right value in another form is flagged', () => {
    const cases: [string, string, string][] = [['3x + 6', 'Expand 3(x + 2)', '3(2 + x)'], ['3(x + 2)', 'Factorise 3x + 6', '6 + 3x'], ['35 mm', 'Write 3.5 cm in millimetres', '0.035 m'], ['0.35', 'Write 35/100 as a decimal', '35/100'], ['7/10', 'Write 0.7 as a fraction', '0.70'], ['195 min', 'Convert 3 h 15 min into minutes', '3.25 h']];
    for (const [key, prompt, read] of cases) {
      const m = markAnswer(k(key, prompt), read);
      expect(m.status === 'correct' && m.flags.length === 0, `${prompt} ${read}`).toBe(false);
    }
    expect(markAnswer(k('35 mm', 'Write 3.5 cm in millimetres'), '35 mm').flags).toEqual([]);
  });
  it('R8-02 a stray % is not accepted on a question that does not ask for a percentage', () => {
    expect(markAnswer(k('12', 'Find 15% of 80'), '12%').status).not.toBe('correct');
    expect(markAnswer(k('45', 'What percentage of the class walked?'), '45%').status).toBe('correct');
  });
  it('R8-04 R8-05 a copied question is not blank; working on a number question counts its value', () => {
    const r = markRead([k('4200', 'Write 4.2 kg in grams')], { answers: [{ q: 1, finalAnswer: 'Write 4.2 kg in grams', crossedOutText: '' }] });
    expect(r[0].status).not.toBe('blank');
    const m = markAnswer(k('4200', 'Multiply 4.2 by 1000'), '4.2 x 1000 = 4200');
    expect(m.status).toBe('correct'); expect(m.flags).toContain('check_reading');
  });
  it('the planted sample answers do not drown the teacher in "other form" flags', () => {
    let flagged = 0, total = 0;
    for (const cls of ['maths', 'science', 'english']) {
      const man = JSON.parse(readFileSync(`public/samples/${cls}/manifest.json`, 'utf8'));
      for (const s of man.students) for (const a of s.answers) {
        const q = man.quiz.questions.find((x: { q: number }) => x.q === a.q);
        const m = markAnswer({ q: q.q, prompt: q.prompt, answer: q.key }, a.written);
        total++; if (m.flags.includes('other_form')) flagged++;
      }
    }
    expect(flagged / total).toBeLessThan(0.06);
  });
});

describe('round 9', () => {
  it('R9-01 the precision a rounding question asks for', () => {
    expect(markAnswer(k('3.14', 'Round 3.14159 to 2 decimal places'), '3.140').flags).toContain('other_form');
    expect(markAnswer(k('3.14', 'Round 3.14159 to 2 decimal places'), '3.14').flags).toEqual([]);
  });
  it('R9-02 a related word is not a silent wrong', () => {
    const m = markAnswer(k('gravity', 'What pulls objects towards the Earth?'), 'gravitational force');
    expect(m.status === 'wrong' && m.flags.length === 0).toBe(false);
  });
  it('R9-03 R9-07 unsimplified algebra is flagged', () => {
    expect(markAnswer(k('5x', 'Simplify 4x + 3x - 2x'), '7x - 2x').flags).toContain('other_form');
    expect(markAnswer(k('x = 8', 'Solve 2x = 16'), 'x = 16/2').flags).toContain('other_form');
    expect(markAnswer(k('x = 8', 'Solve 2x = 16'), 'x = 8').flags).toEqual([]);
  });
});

describe('round 9 engine', () => {
  it('E9-01 the printed question read back is flagged', async () => {
    const { markRead } = await import('./pipeline');
    const r = markRead([k('chlorophyll', 'The green substance in leaves that traps light is called …')], { answers: [{ q: 1, finalAnswer: 'The green substance in leaves that traps light is called', crossedOutText: '' }] });
    expect(r[0].flags).toContain('check_reading');
  });
  it('E9-02 E9-05 a form the question names', () => {
    expect(markAnswer(k('4(x + 2)', 'Factorise 4x + 8'), '2(2x + 4)').flags).toContain('other_form');
    expect(markAnswer(k('1 1/2', 'Write 6/4 as a mixed number'), '3/2').flags.length).toBeGreaterThan(0);
  });
  it('E9-03 E9-04 working then a mixed number; a value with a unit', () => {
    expect(markAnswer(k('x = 2 1/2', 'Solve 2x = 5'), '2x = 5 2 1/2').status).toBe('correct');
    const m = markAnswer(k('x = 2', 'Find x: the side is x cm'), 'x = 2 cm');
    expect(m.status).toBe('correct'); expect(m.flags).toContain('other_form');
  });
  it('E9-06 units typed without a space', () => {
    expect(markAnswer(k('12V'), '12 volts').status).toBe('correct');
    expect(markAnswer(k('50Hz'), '50 Hz').status).toBe('correct');
  });
  it('E9-07 the same thing in other words is right and flagged', () => {
    for (const [key, read] of [['carbon dioxide', 'CO2'], ['eight', '8'], ['sulphur', 'sulfur']]) {
      const m = markAnswer(k(key), read);
      expect(m.status, read).toBe('correct'); expect(m.flags, read).toContain('other_form');
    }
  });
  it('E9-08 the option text instead of its letter', () => {
    const m = markAnswer(k('A', 'Ice floats. A) True B) False'), 'True');
    expect(m.status).toBe('correct'); expect(m.flags).toContain('other_form');
  });
  it('E9-09 articles and capitals when they are the point', () => {
    const ap = markAnswer(k('an apple'), 'a apple');
    expect(ap.status === 'correct' && ap.flags.length === 0).toBe(false);
    expect(markAnswer(k('Monday', 'Write the day with a capital letter'), 'monday').flags).toContain('check_spelling');
  });
});
