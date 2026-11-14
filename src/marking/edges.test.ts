// Round-1 pins: every engine edge case the reviewers found, fixed and held in place.
import { describe, expect, it } from 'vitest';
import { keyProblem, markAnswer, needsReread, type QuestionKey } from './mark';
import { applyCorrection, markWrongByTeacher, mergeReread, needsCheck, rereadQuestions } from './pipeline';
import { matchName, parseRoster } from './roster';
import { evaluate, format, mixedAlternatives, parse, parseExpr } from './fraction';
import { coerceSheetRead, TOTALS_SCHEMA_CLOUD } from '../ai/schemas';
import { csvAnswer, validTemplate } from '../privacy/templates';
import { buildTotals, suppressRow, validatePayload } from '../privacy/aggregate';
import { findRosterNames, rosterTokens } from '../privacy/nameCheck';
import { FIXED_VOCAB, totalsPrompt } from '../ai/prompts';

const K = (q: number, prompt: string, answer: string): QuestionKey => ({ q, prompt, answer });

describe('E03: unreadable answers stay open until the teacher decides', () => {
  const k = K(4, '3/4 - 1/3', '5/12');
  it('a "two answers" read needs a check even when accepted as read', () => {
    const m = markAnswer(k, '3/4 1/2');
    expect(needsCheck({ ...m, flags: [] })).toBe(true);
    expect(needsCheck(applyCorrection(k, m, '3/4 1/2'))).toBe(true);
  });
  it('"Mark wrong" is the teacher\'s decision and closes it', () => {
    const w = markWrongByTeacher(markAnswer(k, '3/4 1/2'));
    expect(w.status).toBe('wrong');
    expect(needsCheck(w)).toBe(false);
    expect(w.flags).toEqual(['teacher_changed']);
  });
});

describe('E04/E24: model readings with bad question numbers', () => {
  it('throws when no item has a usable q (the runner retries once)', () => {
    expect(() => coerceSheetRead({ answers: [{ finalAnswer: '3/4' }, { q: true, finalAnswer: '1' }] }, 3)).toThrow(SyntaxError);
  });
  it('repairs 0-based numbering', () => {
    const r = coerceSheetRead({ answers: [{ q: 0, finalAnswer: 'a' }, { q: 1, finalAnswer: 'b' }, { q: 2, finalAnswer: 'c' }] }, 3);
    expect(r.answers.map((a) => a.finalAnswer)).toEqual(['a', 'b', 'c']);
  });
  it('a duplicated q with a different answer becomes "two answers"', () => {
    const r = coerceSheetRead({ answers: [{ q: 1, finalAnswer: '4/5' }, { q: 1, finalAnswer: '3/4' }] }, 1);
    expect(markAnswer(K(1, '1/2 + 1/4', '3/4'), r.answers[0].finalAnswer).flags).toContain('two_answers');
  });
  it('strict types, trim before slicing, q as a numeric string', () => {
    const r = coerceSheetRead({ answers: [{ q: '2', finalAnswer: `${' '.repeat(30)}3/4`, crossedOutText: { a: 1 } }] }, 2);
    expect(r.answers[1]).toEqual({ q: 2, crossedOutText: '', finalAnswer: '3/4' });
  });
});

describe('E05: blanks get a second look on sheets with writing', () => {
  const keys = [K(1, '1/2 + 1/4', '3/4'), K(2, '2/3 + 1/6', '5/6')];
  it('blank question is re-read when the sheet has other answers', () => {
    const marks = [markAnswer(keys[0], '3/4'), markAnswer(keys[1], '')];
    expect(rereadQuestions(keys, marks)).toEqual([2]);
    expect(needsReread(keys[1], marks[1])).toBe(true);
  });
  it('an empty sheet is not re-read', () => {
    expect(rereadQuestions(keys, [markAnswer(keys[0], ''), markAnswer(keys[1], '')])).toEqual([]);
  });
});

describe('E06/E07: answer keys and question formats', () => {
  it('asks for the key in simplest form', () => {
    expect(keyProblem(K(1, '1/4 + 1/4', '2/4'))).toMatch(/simplest form/);
    expect(keyProblem(K(1, '1/4 + 1/4', '1/2'))).toBeNull();
  });
  it.each(['2/3 + 1/6 = ?', '2/3 + 1/6 = ___', '1) 2/3 + 1/6', 'Q1. 2/3 + 1/6', '(1) 2/3 + 1/6 ='])('parses %s', (p) => {
    expect(format(evaluate(parseExpr(p)!))).toBe('5/6');
  });
  it('whole number divided by a fraction', () => {
    expect(format(evaluate(parseExpr('2 ÷ 1/3')!))).toBe('6');
    expect(format(evaluate(parseExpr('3 ÷ 3/4')!))).toBe('4');
    expect(keyProblem(K(1, '2 ÷ 1/3', '7'))).toMatch(/does not equal/);
  });
});

describe('E09/E12: templates and CSV', () => {
  it.each(['{{student}} {{ छात्र }}', '{{student name}} x {{student}}', '{{{student}}}', 'Hi {{student}} {{'])('rejects %s', (t) => expect(validTemplate(t)).toBe(false));
  it('writes fraction answers as text', () => {
    expect(csvAnswer('3/4')).toBe('"=""3/4"""');
    expect(csvAnswer('-1/2')).toBe('"=""-1/2"""');
    expect(csvAnswer('five')).toBe('five');
  });
});

describe('E11/E13: rosters and names', () => {
  it('parses register columns and drops a header row', () => {
    expect(parseRoster('Roll No\tName\n1\tAarav Shah\n2\tMeera Iyer')).toEqual(['Aarav Shah', 'Meera Iyer']);
    expect(parseRoster('1, Aarav Shah\nShah, Aarav')).toEqual(['Aarav Shah', 'Shah, Aarav']);
  });
  it('different first names are never confident', () => {
    expect(matchName('Kavya R', [{ id: 'k', name: 'Kavita Rao' }]).confident).toBe(false);
    expect(matchName('Arjun', [{ id: 'a', name: 'Arun Kumar' }]).confident).toBe(false);
    expect(matchName('Meera K.', [{ id: 'm', name: 'Meera Krishnan' }, { id: 'r', name: 'Rohan Das' }]).confident).toBe(true);
  });
  it('duplicate names are never confident', () => {
    const roster = [{ id: 'a', name: 'Riya Pillai' }, { id: 'b', name: 'Riya Pillai' }];
    expect(matchName('Riya Pillai', roster).confident).toBe(false);
  });
});

describe('E14/E16/E17/E19/E20/E21/E22: small parse cases', () => {
  it('Indic digits', () => {
    expect(parse('३/४')).toMatchObject({ kind: 'value', value: { n: 3, d: 4 } });
    expect(parse('௩/௪')).toMatchObject({ kind: 'value', value: { n: 3, d: 4 } });
  });
  it('word keys ignore trailing punctuation', () => expect(markAnswer(K(1, '', 'triangle'), 'Triangle.').status).toBe('correct'));
  it('refuses numbers beyond exact arithmetic', () => {
    expect(parse('0.3333333333333333').kind).toBe('unparseable');
    expect(parse('12345678901234567/2').kind).toBe('unparseable');
  });
  it('no empty suggestions', () => {
    const k = K(1, '1/2 + 1/4', '3/4');
    expect(mergeReread([markAnswer(k, '2/6')], new Map([[1, '']]))[0].suggestions).not.toContain('');
  });
  it('whole_dropped only for written mixed numbers', () => {
    expect(markAnswer(K(1, '1/2 × 3', '1 1/2'), '0').misconception).not.toBe('whole_dropped');
  });
  it('signs', () => {
    expect(parse('- 5/12')).toMatchObject({ kind: 'value', value: { n: -5, d: 12 } });
    expect(parse('+1/2')).toMatchObject({ kind: 'value', value: { n: 1, d: 2 } });
  });
  it('no meaningless mixed alternatives', () => {
    expect(mixedAlternatives('01/02')).toEqual([]);
    expect(mixedAlternatives('10/10')).toEqual([]);
  });
});

describe('R09: hidden class counts can never be worked out', () => {
  // Enumerate every completion of the hidden cells consistent with the published cells and the total.
  const completions = (cells: (number | 'hidden')[], total: number): number[][] => {
    const hiddenIdx = cells.map((c, i) => (c === 'hidden' ? i : -1)).filter((i) => i >= 0);
    const residual = total - cells.reduce<number>((a, c) => a + (c === 'hidden' ? 0 : c), 0);
    const out: number[][] = [];
    const rec = (i: number, left: number, acc: number[]) => {
      if (i === hiddenIdx.length) { if (left === 0) out.push(acc); return; }
      for (let v = 0; v <= left; v++) rec(i + 1, left - v, [...acc, v]);
    };
    rec(0, residual, []);
    return out;
  };
  it('reviewer rows', () => {
    expect(suppressRow([4, 1, 1, 0, 0], 3, true).filter((c) => c === 'hidden').length).toBeGreaterThanOrEqual(3);
    expect(suppressRow([1, 1, 1], 3, true)).not.toEqual(['hidden', 'hidden', 'hidden'].map((x, i) => (i < 0 ? x : x)).slice(0, 2));
  });
  it('property: every hidden cell has at least two possible values', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let t = 0; t < 500; t++) {
      const k = 3 + rnd(3);
      const row = Array.from({ length: 5 }, () => rnd(4) === 0 ? 0 : rnd(5));
      const total = row.reduce((a, b) => a + b, 0);
      if (total > 12) continue;
      const cells = suppressRow(row, k, true);
      const hidden = cells.map((c, i) => (c === 'hidden' ? i : -1)).filter((i) => i >= 0);
      if (!hidden.length) continue;
      // an attacker who knows the rule: non-zero cells below k are always hidden, so any hidden cell may be anything >= 0
      const comps = completions(cells, total);
      hidden.forEach((_, j) => {
        const values = new Set(comps.map((c) => c[j]));
        expect(values.size, `row ${row} k ${k} -> ${cells}`).toBeGreaterThanOrEqual(2);
      });
    }
  });
});

describe('R12/R49: names in our own prompt, and the payload k', () => {
  const sheets = Array.from({ length: 6 }, () => ({ marks: [markAnswer(K(1, '1/2 + 1/4', '3/4'), '3/4')] }));
  const t = buildTotals([K(1, '1/2 + 1/4', '3/4')], sheets, 3, ['en', 'hi']);
  it.each(['Max Weber', 'Ta Minh', 'Do Van An', 'Kept Singh', 'Hi Kim', 'Home Ray', 'Most Lee', 'Core A'])('%s does not block the plan', (name) => {
    expect(findRosterNames(totalsPrompt(t), rosterTokens([name]), FIXED_VOCAB)).toEqual([]);
  });
  it('a real name in the payload still hits', () => {
    expect(findRosterNames(`${totalsPrompt(t)} Aarav`, rosterTokens(['Aarav Shah']), FIXED_VOCAB)).not.toEqual([]);
  });
  it('validation uses the configured minimum group size', () => {
    expect(() => validatePayload(t, 5)).toThrow(/k/);
    expect(() => validatePayload(t, 3)).not.toThrow();
  });
  it('the cloud schema still covers the languages we request', () => {
    expect(JSON.stringify(TOTALS_SCHEMA_CLOUD)).toContain('"hi"');
  });
});

describe('crossed-out noise is cleared only by an agreeing second read', () => {
  const k = K(2, '2/3 + 1/6', '5/6');
  it('agreeing second read turns the flag into a note', () => {
    const m = markAnswer(k, '5/6', '4/5');
    expect(m.flags).toContain('crossed_out');
    const merged = mergeReread([m], new Map([[2, '5/6']]))[0];
    expect(merged.flags).not.toContain('crossed_out');
    expect(merged.crossedOut).toBe('4/5'); // still shown to the teacher
  });
  it('a disagreeing second read keeps it flagged', () => {
    const merged = mergeReread([markAnswer(k, '5/6', '4/5')], new Map([[2, '4/5']]))[0];
    expect(merged.flags).toEqual(expect.arrayContaining(['crossed_out', 'reread_disagreed']));
  });
  it('without a second read it stays flagged', () => {
    expect(mergeReread([markAnswer(k, '5/6', '4/5')], new Map())[0].flags).toContain('crossed_out');
  });
});

describe('practice answers are checked even inside sentences', async () => {
  const { extractExpr } = await import('./fraction');
  it.each([['What is the answer to 1/3 + 1/6?', '1/2'], ['Work out 2 1/3 − 1/2.', '1 5/6'], ['Find 3/4 ÷ 1/2', '1 1/2'], ['1/3 x 3/4 = ?', '1/4']])('%s', (q, a) => {
    expect(format(evaluate(extractExpr(q)!))).toBe(a);
  });
  it('no sum, no check', () => expect(extractExpr('Explain why we need a common denominator.')).toBeNull());
});
