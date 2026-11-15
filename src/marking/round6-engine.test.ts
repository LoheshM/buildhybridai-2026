// Round 6 pins: regressions from round 5 and the remaining wrong-mark-without-a-flag cases.
import { describe, expect, it } from 'vitest';
import { keyProblem, markAnswer, type QuestionKey } from './mark';
import { markQuantity } from './numeric';
import { adjustSuggestion, decideOpen, talksToMarker, toSuggestion } from './open';
import { detectType, keyCore } from './qtypes';
import { buildTotals } from '../privacy/aggregate';

const k = (answer: string, prompt = ''): QuestionKey => ({ q: 1, prompt, answer });

describe('round 6 engine', () => {
  it('E6-01 brackets that are part of the answer stay in the key', () => {
    expect(keyCore('3(2 + xy)')).toBe('3(2 + xy)');
    expect(keyCore('carbon dioxide (CO2)')).toBe('carbon dioxide (CO2)');
    expect(keyCore('12 (cm)')).toBe('12 (cm)');
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
