import { describe, expect, it } from 'vitest';
import { eq, evaluate, exprText, format, frac, mixedAlternatives, normalize, parse, parseExpr } from './fraction';

const val = (s: string) => { const p = parse(s); if (p.kind !== 'value') throw new Error(`not a value: ${s} (${p.kind})`); return p; };

describe('parse', () => {
  it.each([
    ['3/4', 3, 4, 'fraction'], [' 3 / 4 ', 3, 4, 'fraction'], ['6/8', 6, 8, 'fraction'], ['11/15', 11, 15, 'fraction'],
    ['1 1/2', 3, 2, 'mixed'], ['2 1/4', 9, 4, 'mixed'], ['1 5/6', 11, 6, 'mixed'], ['-1 1/2', -3, 2, 'mixed'],
    ['2', 2, 1, 'integer'], ['0', 0, 1, 'integer'], ['-3', -3, 1, 'integer'],
    ['0.5', 1, 2, 'decimal'], ['1.25', 5, 4, 'decimal'], ['.75', 3, 4, 'decimal'],
    ['½', 1, 2, 'fraction'], ['1½', 3, 2, 'mixed'], ['1 ½', 3, 2, 'mixed'], ['¾', 3, 4, 'fraction'],
    ['−1/2', -1, 2, 'fraction'], ['3⁄4', 3, 4, 'fraction'], ['= 5/6', 5, 6, 'fraction'], ['5/6.', 5, 6, 'fraction'],
    ['３/４', 3, 4, 'fraction'],
  ])('%s → %i/%i (%s)', (s, n, d, form) => {
    const p = val(s);
    expect(eq(p.value, frac(n, d))).toBe(true);
    expect(p.form).toBe(form);
  });

  it('blank', () => { expect(parse('').kind).toBe('blank'); expect(parse('   ').kind).toBe('blank'); expect(parse(null).kind).toBe('blank'); });
  it('two values are "multiple", and mixed numbers stay grouped', () => {
    const p = parse('4 1/2 2 1/4');
    expect(p.kind).toBe('multiple');
    if (p.kind === 'multiple') expect(p.parts).toEqual(['4 1/2', '2 1/4']);
    expect(parse('3/4 1/2').kind).toBe('multiple');
    expect(parse('2/7 1/4').kind).toBe('multiple');
  });
  it.each(['1 1/2/2', '2 1/7/4', 'abc', '5/0', '2 5/3', 'x/4', '3//4'])('unparseable: %s', (s) => {
    expect(['unparseable', 'multiple']).toContain(parse(s).kind);
  });
  it('normalize keeps digits intact', () => { expect(normalize(' 1  1 / 2 ')).toBe('1 1/2'); });
});

describe('mixedAlternatives', () => {
  it('splits a compact fraction into possible mixed numbers', () => {
    expect(mixedAlternatives('11/2')).toEqual(['1 1/2']);
    expect(mixedAlternatives('15/6')).toEqual(['1 5/6']);
    expect(mixedAlternatives('21/4')).toEqual(['2 1/4']);
    expect(mixedAlternatives('3/4')).toEqual([]);
    expect(mixedAlternatives('57/6')).toEqual([]); // "5 7/6" is not a valid mixed number
  });
});

describe('expressions', () => {
  it.each([
    ['1/2 + 1/4', '3/4'], ['2/3 + 1/6', '5/6'], ['3/5 - 1/10', '1/2'], ['3/4 − 1/3', '5/12'], ['2/5 + 1/3', '11/15'],
    ['1/3 × 3/4', '1/4'], ['2/3 x 3/5', '2/5'], ['2/3 * 3/5', '2/5'], ['3/4 ÷ 1/2', '1 1/2'], ['1 1/2 + 3/4', '2 1/4'],
    ['2 1/3 - 1/2', '1 5/6'], ['3/4 : 1/2', '1 1/2'], ['3/4 / 1/2', '1 1/2'], ['5 + 1/2', '5 1/2'],
  ])('%s = %s', (q, a) => {
    const e = parseExpr(q);
    expect(e).not.toBeNull();
    expect(format(evaluate(e!))).toBe(a);
  });
  it('rejects junk and division by zero', () => {
    expect(parseExpr('Meera + 1/2')).toBeNull();
    expect(parseExpr('1/2 ÷ 0')).toBeNull();
    expect(parseExpr('')).toBeNull();
  });
  it('exprText rebuilds from numbers only', () => {
    expect(exprText(parseExpr('1 1/2 + 3/4')!)).toBe('1 1/2 + 3/4');
    expect(exprText(parseExpr('2/3 x 3/5')!)).toBe('2/3 × 3/5');
  });
});

describe('format', () => {
  it('simplifies', () => {
    expect(format(frac(6, 8))).toBe('3/4');
    expect(format(frac(6, 4))).toBe('1 1/2');
    expect(format(frac(6, 4), 'improper')).toBe('3/2');
    expect(format(frac(4, 2))).toBe('2');
    expect(format(frac(-3, 2))).toBe('-1 1/2');
  });
});
