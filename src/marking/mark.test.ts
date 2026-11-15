import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { keyProblem, markAnswer, needsReread, scoreSheet, type QuestionKey } from './mark';
import { detect } from './misconceptions';
import { parse, parseExpr } from './fraction';

const K = (q: number, prompt: string, answer: string): QuestionKey => ({ q, prompt, answer });

describe('markAnswer', () => {
  it('correct, unsimplified, wrong, blank', () => {
    expect(markAnswer(K(1, '1/2 + 1/4', '3/4'), '3/4').status).toBe('correct');
    expect(markAnswer(K(1, '1/2 + 1/4', '3/4'), '6/8').status).toBe('unsimplified');
    expect(markAnswer(K(1, '1/2 + 1/4', '3/4'), '0.75').status).toBe('correct');
    expect(markAnswer(K(8, '3/4 ÷ 1/2', '1 1/2'), '3/2').status).toBe('correct');
    expect(markAnswer(K(8, '3/4 ÷ 1/2', '1 1/2'), '6/4').status).toBe('unsimplified');
    expect(markAnswer(K(9, '1 1/2 + 3/4', '2 1/4'), '2 2/8').status).toBe('unsimplified');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '3/9').status).toBe('wrong');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '').status).toBe('blank');
  });

  it('names the misconception for wrong answers', () => {
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '3/9').misconception).toBe('add_across');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '1/3').misconception).toBe('add_across'); // 3/9 simplified
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '3/6').misconception).toBe('numerators_only');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '3/18').misconception).toBe('denominators_multiplied');
    expect(markAnswer(K(6, '1/3 × 3/4', '1/4'), '4/9').misconception).toBe('cross_multiply');
    expect(markAnswer(K(8, '3/4 ÷ 1/2', '1 1/2'), '3/8').misconception).toBe('no_invert');
    expect(markAnswer(K(8, '3/4 ÷ 1/2', '1 1/2'), '2/3').misconception).toBe('flipped_first');
    expect(markAnswer(K(9, '1 1/2 + 3/4', '2 1/4'), '1 1/4').misconception).toBe('whole_dropped');
    expect(markAnswer(K(4, '3/4 - 1/3', '5/12'), '-5/12').misconception).toBe('reversed_subtraction');
    expect(markAnswer(K(6, '1/3 × 3/4', '1/4'), '13/12').misconception).toBe('wrong_operation');
    expect(markAnswer(K(5, '2/5 + 1/3', '11/15'), '12/15').misconception).toBe('slip');
  });

  it('flags instead of guessing', () => {
    const two = markAnswer(K(4, '3/4 - 1/3', '5/12'), '2/7 5/12');
    expect(two.status).toBe('unreadable');
    expect(two.flags).toContain('two_answers');
    expect(two.suggestions).toEqual(['2/7', '5/12']);
    const unusual = markAnswer(K(2, '2/3 + 1/6', '5/6'), '7/11');
    expect(unusual.status).toBe('wrong');
    expect(unusual.misconception).toBeNull();
    expect(unusual.flags).toContain('unusual');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), 'five sixths').flags).toContain('letters');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '5/6', '4/5').flags).toContain('crossed_out');
    expect(markAnswer(K(2, '2/3 + 1/6', '5/6'), '5/6', '5/6').flags).not.toContain('crossed_out');
  });

  it('never auto-accepts "11/2" for "1 1/2" but offers it as a one-tap fix', () => {
    const m = markAnswer(K(8, '3/4 ÷ 1/2', '1 1/2'), '11/2');
    expect(m.status).toBe('wrong');
    expect(m.flags).toContain('mixed_number_check');
    expect(m.suggestions).toContain('1 1/2');
  });

  it('generic exact-match keys', () => {
    expect(markAnswer(K(1, '', 'triangle'), ' Triangle ').status).toBe('correct');
    expect(markAnswer(K(1, '', 'triangle'), 'square').status).toBe('wrong');
  });

  it('keyProblem catches teacher typos', () => {
    expect(keyProblem(K(1, '1/2 + 1/4', '3/4'))).toBeNull();
    expect(keyProblem(K(1, '1/2 + 1/4', '2/6'))).toMatch(/does not equal/);
    expect(keyProblem(K(1, '1/2 + 1/4', 'abc'))).toMatch(/could not be read/);
  });

  it('scores with configurable credit for unsimplified answers', () => {
    const ks = [K(1, '1/2 + 1/4', '3/4'), K(2, '2/3 + 1/6', '5/6'), K(3, '3/5 - 1/10', '1/2')];
    const ms = [markAnswer(ks[0], '3/4'), markAnswer(ks[1], '10/12'), markAnswer(ks[2], '')];
    expect(scoreSheet(ms).points).toBe(1.5);
    expect(scoreSheet(ms, 1).points).toBe(2);
    expect(scoreSheet(ms, 0).points).toBe(1);
  });

  it('asks for a second read on mixed numbers and odd answers', () => {
    const k = K(8, '3/4 ÷ 1/2', '1 1/2');
    expect(needsReread(k, markAnswer(k, '1 1/2'))).toBe(true);
    const k2 = K(1, '1/2 + 1/4', '3/4');
    expect(needsReread(k2, markAnswer(k2, '3/4'))).toBe(false);
    expect(needsReread(k2, markAnswer(k2, '2/6'))).toBe(false); // explained mistake
  });
});

describe('agreement with the generators ground truth, all three sample classes', () => {
  // tools/samples/classes.py plants each mistake with its own label, independently of src/marking.
  const load = (c: string) => JSON.parse(readFileSync(new URL(`../../public/samples/${c}/manifest.json`, import.meta.url), 'utf8'));
  const STATUS: Record<string, string> = { correct: 'correct', unsimplified: 'unsimplified', blank: 'blank', missing_unit: 'partial', open: 'pending', passage: 'pending' };
  for (const cls of ['maths', 'science', 'english']) {
    it(`${cls}: every planted answer gets the expected status and mistake`, () => {
      const m = load(cls);
      const keys: QuestionKey[] = m.quiz.questions.map((q: { q: number; prompt: string; key: string; spellingCounts?: boolean }) => ({ q: q.q, prompt: q.prompt, answer: q.key, ...(q.spellingCounts ? { spellingCounts: true } : {}) }));
      let n = 0;
      for (const s of m.students) for (const a of s.answers) {
        const k = keys[a.q - 1];
        const r = markAnswer(k, a.written, a.crossedOut);
        const why = `${s.id} q${a.q} "${a.written}" (${a.label})`;
        n++;
        if (a.label === 'spelling') { expect(r.misconception, why).toBe('spelling'); expect(r.status, why).toBe(k.spellingCounts ? 'wrong' : 'correct'); continue; }
        if (STATUS[a.label]) { expect(r.status, why).toBe(STATUS[a.label]); if (a.label === 'missing_unit') expect(r.misconception, why).toBe('missing_unit'); continue; }
        expect(r.status, why).toBe('wrong');
        if (a.label === 'wrong') continue; // multiple choice: the option picked is the insight
        // a slip can coincide in value with a real misconception (6/12 = 2/4 for 3/4 - 1/3)
        const ok = a.label === 'other' ? [null, 'slip', 'wrong_operation'] : a.label === 'slip' ? ['slip', 'numerators_only', 'add_across'] : [a.label];
        expect(ok, why).toContain(r.misconception);
      }
      expect(n).toBe(m.students.length * m.quiz.questions.length);
    });
  }
  it('the fraction detectors recover injected misconceptions from the arithmetic alone', () => {
    const m = load('maths');
    for (const s of m.students) for (const a of s.answers) {
      const q = m.quiz.questions[a.q - 1];
      const e = parseExpr(q.prompt);
      if (!e || !['add_across', 'numerators_only', 'cross_multiply', 'no_invert', 'whole_dropped'].includes(a.label)) continue;
      const p = parse(a.written);
      if (p.kind !== 'value') throw new Error('bad sample');
      expect(detect(e, p.value), `${s.id} q${a.q}`).toBe(a.label);
    }
  });
});

describe('pipeline merge', async () => {
  const { mergeReread } = await import('./pipeline');
  const k = K(3, '3/5 - 1/10', '1/2');
  it('agreement keeps the mark; disagreement flags and offers only clean values', () => {
    const m = markAnswer(k, '1/2');
    expect(mergeReread([m], new Map([[3, '1/2']]))[0]).toEqual(m);
    const d = mergeReread([m], new Map([[3, '1 1/2']]))[0];
    expect(d.flags).toContain('reread_disagreed');
    expect(d.suggestions).toContain('1 1/2');
    const g = mergeReread([m], new Map([[3, '/2 1/2']]))[0];
    expect(g.flags).toContain('reread_disagreed');
    expect(g.suggestions).not.toContain('/2 1/2');
    expect(g.status).toBe('correct'); // a second opinion never changes the mark by itself
  });
  it('crossed-out text equal to the answer is dropped', () => {
    expect(markAnswer(k, '1/2', '1/2').crossedOut).toBe('');
  });
});

describe('round 1 P0 pins', async () => {
  const { mergeReread } = await import('./pipeline');
  const { matchName } = await import('./roster');
  it('E02: a second read of "2 2/8" disagrees with "2 1/4"', () => {
    const k = K(9, '1 1/2 + 3/4', '2 1/4');
    const m = markAnswer(k, '2 1/4');
    const d = mergeReread([m], new Map([[9, '2 2/8']]))[0];
    expect(d.flags).toContain('reread_disagreed');
    expect(d.status).toBe('correct');
  });
  it('E01: a fallback name match after a wrong guess is never confident', () => {
    const roster = [{ id: 'a', name: 'Aarav Shah' }, { id: 'b', name: 'Aarav Singh' }];
    const first = matchName('Aarav Sh.', roster);
    const second = matchName('Aarav Shah', roster, new Set(['a'])); // "a" wrongly taken by another sheet
    expect(first.studentId).toBe('a');
    expect(second.studentId).toBe('b');
    expect(second.confident).toBe(false);
  });
});
