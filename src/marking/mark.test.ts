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

describe('agreement with the independent sample simulator', () => {
  // tools/samples/simulate.mjs injects known misconceptions using its own arithmetic.
  const m = JSON.parse(readFileSync(new URL('../../public/samples/manifest.json', import.meta.url), 'utf8'));
  const keys: QuestionKey[] = m.quiz.questions.map((q: { q: number; prompt: string; key: string }) => K(q.q, q.prompt, q.key));
  it('every ground-truth answer gets the expected status', () => {
    let n = 0;
    for (const s of m.students) for (const a of s.answers) {
      const r = markAnswer(keys[a.q - 1], a.written, a.crossedOut);
      const want = a.label === 'correct' ? 'correct' : a.label === 'unsimplified' ? 'unsimplified' : a.label === 'blank' ? 'blank' : 'wrong';
      expect(r.status, `${s.id} q${a.q} "${a.written}" (${a.label})`).toBe(want);
      n++;
    }
    expect(n).toBe(280);
  });
  it('injected misconceptions are recovered by the detectors', () => {
    const expected: Record<string, string[]> = {
      add_across: ['add_across'], numerators_only: ['numerators_only'], cross_multiply: ['cross_multiply'],
      no_invert: ['no_invert'], whole_dropped: ['whole_dropped'],
      // a slip can coincide in value with a real misconception (6/12 = 2/4 for 3/4 - 1/3)
      slip: ['slip', 'numerators_only', 'add_across'],
    };
    for (const s of m.students) for (const a of s.answers) {
      if (!expected[a.label]) continue;
      const q = m.quiz.questions[a.q - 1];
      const p = parse(a.written);
      if (p.kind !== 'value') throw new Error('bad sample');
      expect(expected[a.label], `${s.id} q${a.q} ${q.prompt} → ${a.written}`).toContain(detect(parseExpr(q.prompt)!, p.value));
    }
  });
});
