// Round-1 pins: every engine edge case the reviewers found, fixed and held in place.
import { describe, expect, it } from 'vitest';
import { keyProblem, markAnswer, needsReread, type QuestionKey } from './mark';
import { applyCorrection, markWrongByTeacher, mergeReread, needsCheck, rereadQuestions } from './pipeline';
import { matchName, parseRoster } from './roster';
import { evaluate, format, mixedAlternatives, parse, parseExpr } from './fraction';
import { coerceSheetRead, TOTALS_SCHEMA_CLOUD } from '../ai/schemas';
import { csvAnswer, validTemplate } from '../privacy/templates';
import { buildTotals, hiddenRange, questionCells, suppressRow, validatePayload } from '../privacy/aggregate';
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
    const r = coerceSheetRead({ answers: [{ q: 0, finalAnswer: '1/2' }, { q: 1, finalAnswer: '3/4' }, { q: 2, finalAnswer: '5/6' }] }, 3);
    expect(r.answers.map((a) => a.finalAnswer)).toEqual(['1/2', '3/4', '5/6']);
  });
  it('a name read as q:0 is dropped, not shifted into the answers', () => {
    const r = coerceSheetRead({ answers: [{ q: 0, finalAnswer: 'Aarav' }, { q: 1, finalAnswer: '3/4' }, { q: 2, finalAnswer: '5/6' }] }, 3);
    expect(r.answers.map((a) => a.finalAnswer)).toEqual(['3/4', '5/6', '']);
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

describe('R09/C1: no hidden class count can be worked out, even by someone who knows the algorithm', () => {
  // The exact attacker: enumerate every row with the same length and total that this algorithm would
  // publish identically. A hidden cell leaks if all such rows agree on its value.
  const rowsSumming = (len: number, total: number): number[][] => {
    if (len === 1) return [[total]];
    const out: number[][] = [];
    for (let v = 0; v <= total; v++) for (const rest of rowsSumming(len - 1, total - v)) out.push([v, ...rest]);
    return out;
  };
  const leaks = (row: number[], k: number): number[] => {
    const cells = suppressRow(row, k, true);
    if (!cells) return []; // withheld: nothing published
    const pub = JSON.stringify(cells);
    const total = row.reduce((a, b) => a + b, 0);
    const same = rowsSumming(row.length, total).filter((r) => JSON.stringify(suppressRow(r, k, true)) === pub);
    return cells.map((c, i) => (c === 'hidden' && new Set(same.map((r) => r[i])).size === 1 ? i : -1)).filter((i) => i >= 0);
  };
  it('reviewer rows no longer leak', () => {
    expect(leaks([4, 1, 1, 0, 0], 3)).toEqual([]);
    expect(leaks([3, 2, 2], 3)).toEqual([]);
    expect(leaks([1, 1, 1], 3)).toEqual([]);
    expect(leaks([6, 0, 0, 0, 0], 10)).toEqual([]);
  });
  it('property: across many random rows, no hidden cell is ever pinned', () => {
    let seed = 11, checked = 0;
    const rnd = (n: number) => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) % n);
    for (let t = 0; t < 1500; t++) {
      const k = 3 + rnd(3);
      const row = Array.from({ length: 2 + rnd(3) }, () => (rnd(4) === 0 ? 0 : rnd(6)));
      const out = suppressRow(row, k, true);
      if (row.reduce((a, b) => a + b, 0) > 12 || !out || !out.includes('hidden')) continue;
      expect(leaks(row, k), `row ${row} k ${k} -> ${JSON.stringify(suppressRow(row, k, true))}`).toEqual([]);
      checked++;
    }
    expect(checked).toBeGreaterThan(300);
  });
  it('hiddenRange is consistent', () => {
    const r = hiddenRange([3, 2, 2], [false, true, true], 3)!;
    expect(r).toEqual([2, 2]); // why [3,h,h] was unsafe
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

describe('crossed-out work: noise is cleared, a possible swap is never silent', () => {
  const k = K(2, '2/3 + 1/6', '5/6');
  it('second read sees no crossed-out work: the first read imagined it, so it becomes a note', () => {
    const m = markAnswer(k, '5/6', '4/5');
    expect(m.flags).toContain('crossed_out');
    const merged = mergeReread([m], new Map([[2, { final: '5/6', crossed: '' }]]), [k])[0];
    expect(merged.flags).not.toContain('crossed_out');
    expect(merged.crossedOut).toBe('4/5'); // still shown to the teacher
  });
  it('R1: both reads see crossed-out work and a swap would change the mark: the teacher checks it', () => {
    // the student wrote 5/6, crossed it out and wrote 4/5; both reads swapped them
    const merged = mergeReread([markAnswer(k, '5/6', '4/5')], new Map([[2, { final: '5/6', crossed: '4/5' }]]), [k])[0];
    expect(merged.status).toBe('correct');
    expect(merged.flags).toContain('crossed_out');
    expect(needsCheck(merged)).toBe(true);
  });
  it('a swap that could not change the mark is cleared', () => {
    const merged = mergeReread([markAnswer(k, '5/6', '10/12x')], new Map([[2, { final: '5/6', crossed: '10/12x' }]]), [k])[0];
    expect(merged.flags).not.toContain('crossed_out');
  });
  it('a disagreeing second read keeps it flagged', () => {
    const merged = mergeReread([markAnswer(k, '5/6', '4/5')], new Map([[2, { final: '4/5', crossed: '' }]]), [k])[0];
    expect(merged.flags).toEqual(expect.arrayContaining(['crossed_out', 'reread_disagreed']));
  });
  it('without a second read it stays flagged', () => {
    expect(mergeReread([markAnswer(k, '5/6', '4/5')], new Map(), [k])[0].flags).toContain('crossed_out');
  });
});

describe('R2: whole-question states never pin a hidden count', () => {
  // Every question state (right, wrong, up to 3 mistake groups) for a class of 5-9 (published as "5+").
  const groups = ['add_across', 'numerators_only', 'other'];
  const parts = (n: number, g: number): number[][] => (g === 0 ? (n === 0 ? [[]] : []) : Array.from({ length: n + 1 }, (_, v) => v).flatMap((v) => parts(n - v, g - 1).map((r) => [v, ...r])));
  it('every published question has at least two consistent states for each hidden cell', () => {
    // No class size is sent, so right and wrong are unbounded: enumerate up to 14 and judge only
    // outputs whose visible numbers stay well inside the enumerated range.
    const k = 3;
    const byOutput = new Map<string, number[][]>(); // output -> states [right, wrong, g1, g2, g3]
    for (let wrong = 0; wrong <= 14; wrong++) for (let right = 0; right <= 14; right++) {
      for (const split of parts(wrong, 3)) {
        const gs = split.map((v, i) => [groups[i], v] as [string, number]).filter(([, v]) => v > 0);
        const out = JSON.stringify(questionCells(right, 0, wrong, gs, k));
        const list = byOutput.get(out) ?? [];
        list.push([right, wrong, ...split]);
        byOutput.set(out, list);
      }
    }
    let pinned = 0;
    for (const [out, states] of byOutput) {
      const o = JSON.parse(out);
      if ([o.right, o.wrong, ...Object.values(o.mistakes)].some((v) => typeof v === 'number' && v > 10)) continue;
      const hiddenIdx: number[] = [];
      if (o.right === 'hidden') hiddenIdx.push(0);
      if (o.wrong === 'hidden') hiddenIdx.push(1);
      groups.forEach((g, i) => { if (o.mistakes[g] === 'hidden') hiddenIdx.push(2 + i); });
      for (const i of hiddenIdx) if (new Set(states.map((s) => s[i])).size < 2) pinned++;
    }
    expect(pinned).toBe(0);
  });
  it('two pupils wrong in two different ways: the breakdown is not sent', () => {
    expect(questionCells(20, 0, 2, [['add_across', 1], ['other', 1]], 3)).toEqual({ right: 20, partial: 0, wrong: 'hidden', mistakes: {} });
  });
});

describe('practice answers are checked even inside sentences', async () => {
  const { extractExpr } = await import('./fraction');
  it.each([['What is the answer to 1/3 + 1/6?', '1/2'], ['Work out 2 1/3 − 1/2.', '1 5/6'], ['Find 3/4 ÷ 1/2', '1 1/2'], ['1/3 x 3/4 = ?', '1/4']])('%s', (q, a) => {
    expect(format(evaluate(extractExpr(q)!))).toBe(a);
  });
  it('no sum, no check', () => expect(extractExpr('Explain why we need a common denominator.')).toBeNull());
});
