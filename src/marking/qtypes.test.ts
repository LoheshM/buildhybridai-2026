import { describe, expect, it } from 'vitest';
import { detectType, keyPoints, marksFor, parseRubric } from './qtypes';
import { markQuantity, parseQuantity } from './numeric';
import { equivalent, linearEquation, markAlgebra } from './algebra';
import { markChoice, markWord, normChoice } from './words';

describe('detectType: the key picks the type', () => {
  const cases: [string, string, string?][] = [
    ['3/4', 'fraction'], ['1 1/2', 'fraction'], ['1', 'fraction', '2/3 + 1/3'],
    ['0.75', 'number'], ['-12', 'number'], ['3.5 cm', 'number'], ['3.5cm', 'number'], ['45%', 'number'], ['£4.50', 'number'], ['1,250 g', 'number'], ['7', 'number'],
    ['x = 4', 'algebra'], ['2x + 3', 'algebra'], ['3(x + 2)', 'algebra'], ['y = -2.5', 'algebra'],
    ['B', 'choice'], ['(c)', 'choice'], ['True', 'choice'], ['false', 'choice'],
    ['photosynthesis', 'word'], ['Paris', 'word'], ['evaporation / evaporating', 'word'], ['carbon dioxide', 'word'], ['went', 'word'],
    ['Plants make their own food using sunlight.', 'short'], ['makes its own food; uses sunlight; needs chlorophyll', 'short'],
    ['Rubric: Ideas 3; Organisation 2; Spelling and punctuation 2', 'passage'], ['Ideas (3)\nOrganisation (2)', 'passage'],
  ];
  for (const [key, want, prompt] of cases) it(`${key} → ${want}`, () => expect(detectType(key, prompt)).toBe(want));
  it('key points and rubric marks', () => {
    expect(keyPoints('makes food; uses sunlight.\nchlorophyll')).toEqual(['makes food', 'uses sunlight', 'chlorophyll']);
    expect(parseRubric('Rubric: Ideas 3; Organisation (2 marks); Spelling - 2')).toEqual([{ line: 'Ideas', max: 3 }, { line: 'Organisation', max: 2 }, { line: 'Spelling', max: 2 }]);
    expect(marksFor('short', 'a; b; c')).toBe(3);
    expect(marksFor('passage', 'Rubric: Ideas 3; Organisation 2')).toBe(5);
    expect(marksFor('word', 'cat')).toBe(1);
    expect(marksFor('short', 'a; b', 4)).toBe(4);
  });
});

describe('numbers, units, percentages', () => {
  it('parses quantities', () => {
    expect(parseQuantity('3.5 cm')).toMatchObject({ unit: 'cm', decimals: 1 });
    expect(parseQuantity('45 %')).toMatchObject({ percent: true });
    expect(parseQuantity('£4.50')).toMatchObject({ unit: '£' });
    expect(parseQuantity('2x')).toBeNull();
    expect(parseQuantity('4 apples and 3 pears')).toBeNull();
    expect(parseQuantity('')).toBeNull();
  });
  const m = (k: string, r: string, t = 0) => markQuantity(k, r, t);
  it('marks exactly', () => {
    expect(m('0.75', '.75').status).toBe('correct');
    expect(m('0.75', '0.750').status).toBe('correct');
    expect(m('0.3', '0.30').status).toBe('correct');
    expect(m('1250', '1,250').status).toBe('correct');
    expect(m('3.5 cm', '3.5cm').status).toBe('correct');
    expect(m('3.5 cm', '35 mm')).toMatchObject({ status: 'correct' });
    expect(m('2 kg', '2000 g').status).toBe('correct');
    expect(m('90 min', '1.5 hours').status).toBe('correct');
  });
  it('names the mistakes', () => {
    expect(m('-12', '12').mistake).toBe('sign_error');
    expect(m('0.75', '7.5').mistake).toBe('place_value');
    expect(m('0.75', '0.075').mistake).toBe('place_value');
    expect(m('45%', '0.45%').mistake).toBe('percent_decimal');
    expect(m('0.45', '45%')).toMatchObject({ status: 'correct' }); // same value
    expect(m('45%', '0.45')).toMatchObject({ status: 'partial', mistake: 'percent_decimal' });
    expect(m('0.45', '45').mistake).toBe('place_value');
    expect(m('3.5 cm', '3.5')).toMatchObject({ status: 'partial', mistake: 'missing_unit' });
    expect(m('3.5 cm', '3.5 mm')).toMatchObject({ status: 'wrong', mistake: 'wrong_unit' });
    expect(m('3.14', '3.1')).toMatchObject({ status: 'wrong', mistake: 'rounding' });
    expect(m('3.14', '3.142')).toMatchObject({ status: 'wrong', mistake: 'rounding' });
    expect(m('3.14', '3.2').mistake).toBe(null);
    expect(m('7', 'seven').status).toBe('unreadable');
  });
  it('detectors that need the printed question', () => {
    expect(markQuantity('0.85', '0.31', 0, '0.6 + 0.25')).toMatchObject({ mistake: 'decimal_alignment' });
    expect(markQuantity('35 mm', '3.5 mm', 0, 'Write 3.5 cm in millimetres')).toMatchObject({ mistake: 'wrong_unit' });
    expect(markQuantity('35 mm', '350 mm', 0, 'Write 3.5 cm in millimetres')).toMatchObject({ mistake: 'place_value' });
    expect(markQuantity('0.35', '35', 0, 'Write 35% as a decimal')).toMatchObject({ mistake: 'percent_decimal' });
    expect(markQuantity('12', '1200', 0, '15% of 80')).toMatchObject({ mistake: 'percent_decimal' });
  });
  it('tolerance', () => {
    expect(m('3.14', '3.15', 0.01).status).toBe('correct');
    expect(m('3.14', '3.2', 0.01).status).toBe('wrong');
  });
});

describe('algebra', () => {
  it('equivalence by substitution', () => {
    expect(equivalent('2x + 6', '2(x + 3)')).toBe(true);
    expect(equivalent('x^2 + 2x + 1', '(x+1)(x+1)')).toBe(true);
    expect(equivalent('2x + 6', '2x + 3')).toBe(false);
  });
  it('solves and names slips for linear equations', () => {
    const e = linearEquation('2x + 3 = 11')!;
    expect(e.solution).toBe(4);
    expect(e.wrong.get(7)).toBe('inverse_operation'); // (11 + 3) / 2
    expect(e.wrong.get(16)).toBe('inverse_operation'); // (11 - 3) * 2
    expect(e.wrong.get(-4)).toBe('sign_error');
  });
  it('marks answers', () => {
    expect(markAlgebra('x = 4', 'x=4').status).toBe('correct');
    expect(markAlgebra('x = 4', '4').status).toBe('correct');
    expect(markAlgebra('x = 4', 'x = 8/2').status).toBe('correct');
    expect(markAlgebra('x = 4', 'x = 7', '2x + 3 = 11')).toEqual({ status: 'wrong', mistake: 'inverse_operation' });
    expect(markAlgebra('x = 4', 'x = -4', '2x + 3 = 11')).toEqual({ status: 'wrong', mistake: 'sign_error' });
    expect(markAlgebra('x = 4', '2x = 8')).toEqual({ status: 'wrong', mistake: 'not_solved' });
    expect(markAlgebra('x = 4', 'y = 4').status).toBe('wrong');
    expect(markAlgebra('2x + 6', '2(x+3)').status).toBe('correct');
    expect(markAlgebra('2x - 6', '2x + 6')).toEqual({ status: 'wrong', mistake: 'sign_error' });
    expect(markAlgebra('2x + 6', '').status).toBe('unreadable');
    expect(markAlgebra('2x + 6', '2x + ?').status).toBe('unreadable');
  });
});

describe('choice and words', () => {
  it('normalises choices', () => {
    for (const s of ['B', 'b', '(b)', 'b)', 'B.', 'option B', 'B 12']) expect(normChoice(s)).toBe('B');
    expect(normChoice('True')).toBe('true');
    expect(normChoice('T')).toBe('true');
    expect(normChoice('maybe')).toBeNull();
  });
  it('marks choices', () => {
    expect(markChoice('B', '(b)')).toEqual({ status: 'correct', picked: 'B' });
    expect(markChoice('B', 'C')).toEqual({ status: 'wrong', picked: 'C' });
    expect(markChoice('True', 'false')).toEqual({ status: 'wrong', picked: 'false' });
    expect(markChoice('B', '')).toEqual({ status: 'unreadable', picked: null });
  });
  it('marks words', () => {
    expect(markWord('photosynthesis', 'Photosynthesis.').status).toBe('correct');
    expect(markWord('photosynthesis', 'photosynthesus')).toMatchObject({ status: 'correct', mistake: 'spelling' });
    expect(markWord('necessary', 'neccessary', true)).toMatchObject({ status: 'wrong', mistake: 'spelling' });
    expect(markWord('evaporation / evaporating', 'evaporating').status).toBe('correct');
    expect(markWord('nucleus', 'the nucleus of the cell')).toMatchObject({ status: 'correct', extraWords: true });
    expect(markWord('cat', 'cot')).toMatchObject({ status: 'wrong', mistake: 'wrong_term' });
    expect(markWord('went', 'goed')).toMatchObject({ status: 'wrong', mistake: 'wrong_term' });
    expect(markWord('Paris', '').status).toBe('unreadable');
    expect(markWord('café', 'cafe').status).toBe('correct');
  });
});

describe('equations with instruction words', () => {
  it('ignores Solve / for x:', () => {
    expect(linearEquation('Solve 2x + 3 = 11')?.solution).toBe(4);
    expect(linearEquation('Solve for x: 2x = 8')?.solution).toBe(4);
    expect(linearEquation('Solve x + 5 = 9')?.solution).toBe(4);
    expect(markAlgebra('x = 4', 'x = 7', 'Solve 2x + 3 = 11')).toEqual({ status: 'wrong', mistake: 'inverse_operation' });
  });
});

describe('spelling: Nano corrects misspellings, so a spelling answer that reads as the key is checked', async () => {
  const { markAnswer } = await import('./mark');
  it('flags a spelling-counts answer read as exactly the key', () => {
    const k = { q: 1, prompt: "Write the correct spelling of 'neccessary'.", answer: 'necessary', spellingCounts: true };
    expect(markAnswer(k, 'necessary').flags).toContain('check_spelling');
    expect(markAnswer(k, 'necesary').flags).not.toContain('check_spelling'); // a misspelling read as one is not a correction
    expect(markAnswer(k, 'dog').flags).not.toContain('check_spelling');
    expect(markAnswer({ ...k, spellingCounts: false }, 'necessary').flags).not.toContain('check_spelling');
  });
});
