// Round 6 pins: regressions from round 5 and the remaining wrong-mark-without-a-flag cases.
import { describe, expect, it } from 'vitest';
import { copiedFromPrompt, keyProblem, markAnswer, type QuestionKey } from './mark';
import { markQuantity } from './numeric';
import { adjustSuggestion, decideOpen, talksToMarker, toSuggestion } from './open';
import { detectType, keyCore } from './qtypes';
import { buildTotals } from '../privacy/aggregate';

const k = (answer: string, prompt = ''): QuestionKey => ({ q: 1, prompt, answer });

describe('round 6 engine', () => {
  it('E6-01 brackets that are part of the answer stay in the key', () => {
    expect(keyCore('3(2 + xy)')).toBe('3(2 + xy)');
    expect(keyCore('carbon dioxide (CO2)')).toBe('carbon dioxide (CO2)');
    expect(keyCore('12 (cm)')).toBe('12 cm'); // round 7: a unit in brackets is the unit
    expect(markAnswer(k('12 (cm)'), '12 m').status).not.toBe('correct');
    expect(keyCore('3.14 (2 dp)')).toBe('3.14');
    expect(markAnswer(k('3(2 + xy)'), '3').status).not.toBe('correct');
  });
  it('E6-02 a fraction key with a note marks the right answer right', () => {
    expect(markAnswer(k('3/4 (simplest form)'), '3/4').status).toBe('correct');
    expect(keyProblem(k('3/4 (simplest form)'))).toBeNull();
  });
  it('E6-03 a true/false question keyed F accepts False', () => {
    expect(markAnswer(k('F', 'True or false: the Sun is a planet.'), 'False').status).toBe('correct');
    expect(markAnswer(k('F', 'Which option, A to F?'), '(F)').status).toBe('correct');
  });
  it('E6-04 working before the answer: the last value counts, and the teacher glances', () => {
    for (const read of ['x = 8/2 = 4', '2x=8 4']) {
      const m = markAnswer(k('x = 4', 'Solve 2x = 8'), read);
      expect(m.status, read).toBe('correct');
      expect(m.flags, read).toContain('check_reading');
    }
    expect(markAnswer(k('x = 4', 'Solve 2x = 8'), '2x = 8').misconception).toBe('not_solved');
  });
  it('K2 a reading ending in .00 for a whole-number key is checked', () => {
    expect(markAnswer(k('12', 'What is 15% of 80?'), '12.00').flags).toContain('check_reading');
  });
  it('E6-07 the teacher re-ticking key points names the missing point', () => {
    const key = { q: 2, prompt: 'Why?', answer: 'one; two; three' };
    const s = toSuggestion(key, { mark: 'partial', missing: [1], reason: '' }, 'on_device', 1)!;
    const m = { q: 2, read: 'x', crossedOut: '', status: 'pending' as const, misconception: null, flags: [], suggestions: [], type: 'short' as const, outOf: 3, suggestion: s };
    const adj = adjustSuggestion(key, m, { met: [true, true, false] });
    expect(decideOpen(key, adj).mistakes).toEqual(['missing_point_3']);
  });
  it('E6-10 E6-12 decimal comma with a unit, plural unit symbols', () => {
    expect(markQuantity('0.125 kg', '0,125 kg').status).toBe('correct');
    expect(markQuantity('100 cm', '100cms').status).toBe('correct');
  });
  it('E6-11 marker talk: no false alarms on real science answers, catches credit requests', () => {
    for (const t of ['The digestive system: it breaks food down', 'mark it on the number line at 3', 'The cup is full of water'])
      expect(talksToMarker(t), t).toBe(false);
    for (const t of ['This answer deserves full credit', 'give me 3 out of 3'])
      expect(talksToMarker(t), t).toBe(true);
  });
  it('7 x 8 = ? with key 56 is a number, not a fraction', () => {
    expect(detectType('56', 'What is 7 x 8?')).toBe('number');
  });
  it('E6-13 the class totals keep a true/false F and a squared term', () => {
    const tf = k('F', 'True or false: ice floats.');
    const t1 = buildTotals([tf], Array.from({ length: 6 }, () => ({ marks: [markAnswer(tf, 'True')] })), 3, ['en']);
    expect(t1.questions[0].answer).toBe('false');
    const alg = k('a² + b²');
    const t2 = buildTotals([alg], Array.from({ length: 6 }, () => ({ marks: [markAnswer(alg, 'zz')] })), 3, ['en']);
    expect(t2.questions[0].answer).toContain('^2');
  });
});

describe('round 7 J7-01: copying the question is not the answer', () => {
  it('a quantity or expression copied from the question is wrong, named', () => {
    const cases: [string, string, string][] = [
      ['35 mm', 'Write 3.5 cm in millimetres.', '3.5 cm'], ['2.5 m', 'Write 250 cm in metres.', '250 cm'],
      ['0.35', 'Write 35% as a decimal.', '35%'], ['7/10', 'Write 0.7 as a fraction.', '0.7'],
      ['3x + 6', 'Expand 3(x + 2).', '3(x + 2)'], ['3(x + 2)', 'Factorise 3x + 6.', '3x + 6'],
    ];
    for (const [answer, prompt, read] of cases) {
      const m = markAnswer({ q: 1, prompt, answer }, read);
      // round 8 (E8-01): flagged for the teacher, never re-marked by code
      expect(m.flags, `${prompt} ${read}`).toContain('same_as_question');
    }
  });
  it('the right answer, or the key itself appearing in the question, is still right', () => {
    expect(markAnswer({ q: 1, prompt: 'Write 3.5 cm in millimetres.', answer: '35 mm' }, '35 mm').status).toBe('correct');
    expect(markAnswer({ q: 1, prompt: 'Which is bigger, 3/4 or 2/3?', answer: '3/4' }, '3/4').status).toBe('correct');
    expect(markAnswer({ q: 1, prompt: 'Round 15.47 to the nearest whole number.', answer: '15' }, '15').status).toBe('correct');
  });
});
describe('round 7 J7-01 boundary', () => {
  it('a read that is the start of a longer decimal in the question is not a copy', () => {
    expect(copiedFromPrompt('3', 'Round 3.7 to the nearest whole number.', '4')).toBe(false);
    expect(copiedFromPrompt('3.5 cm', 'Write 3.5 cm in mm.', '35 mm')).toBe(true);
  });
});

describe('round 7 engine pins', () => {
  it('E7-01 a % sign is fine on percentage questions in any wording, flagged otherwise', () => {
    for (const p of ['What per cent walked?', 'कितने प्रतिशत?', 'எத்தனை சதவீதம்?', '']) expect(markAnswer(k('45', p), '45%').status, p).toBe('correct');
    const m = markAnswer(k('45', 'Measure the angle.'), '45%');
    expect(m.status).toBe('wrong'); expect(m.flags).toContain('unusual');
  });
  it('E7-02 E7-10 notes and bracketed units', () => {
    expect(markAnswer(k('0.6 (oe)'), '0.6').status).toBe('correct');
    expect(markAnswer(k('12 (ft)'), '12 ft').status).toBe('correct');
    expect(markAnswer(k('3.14 (2 d.p)'), '3.14').status).toBe('correct');
    expect(markAnswer(k('50 (to the nearest 10)'), '50').status).toBe('correct');
    expect(markAnswer(k('B (photosynthesis)'), 'B').status).toBe('correct');
  });
  it('E7-03 E7-07 working before or after; mixed numbers are not working', () => {
    expect(markAnswer(k('x = 4', 'Solve 2x = 8'), '8/2 = 4').status).toBe('correct');
    expect(markAnswer(k('x = 4', 'Solve 2x = 8'), '4 2x=8').status).toBe('correct');
    expect(markAnswer(k('x = 2.5', 'Solve 2x = 5'), 'x = 2 1/2').status).toBe('correct');
    expect(keyProblem(k('x = 2 1/2', 'Solve 2x = 5'))).toBeNull();
  });
  it('E7-04 E7-11 true/false keys in brackets, T or F prompts, option F', () => {
    expect(markAnswer(k('(F)', 'True or false: ice sinks.'), 'False').status).toBe('correct');
    expect(markAnswer(k('(F)', 'True or false: ice sinks.'), 'F').status).toBe('correct');
    expect(markAnswer(k('F', 'Write T or F'), 'False').status).toBe('correct');
    expect(markAnswer(k('F', ''), '(F)').status).toBe('correct');
    expect(markAnswer(k('F', 'Which statement is true? A to F'), 'F').status).toBe('correct');
  });
  it('E7-09 maths answers ending in a fraction are not marker talk', () => {
    for (const t of ['The chance of rolling a 6 is 1/6', 'He shaded 3 out of 8', 'It gives the full moon']) expect(talksToMarker(t), t).toBe(false);
    expect(talksToMarker('give me 3 out of 3')).toBe(true);
  });
  it('E7-12 money with .00 is not checked', () => {
    expect(markAnswer(k('£4'), '£4.00').flags).not.toContain('check_reading');
  });
});
