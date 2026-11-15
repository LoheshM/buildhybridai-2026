import { describe, expect, it } from 'vitest';
import { markAnswer, scoreSheet, type QuestionKey } from './mark';
import { decideOpen, openMistakes, toSuggestion } from './open';

const SHORT: QuestionKey = { q: 6, prompt: 'Why do plants need light?', answer: 'light gives the energy for photosynthesis; plants use it to make their own food' };
const PASSAGE: QuestionKey = { q: 7, prompt: 'Describe a rainy day.', answer: 'Rubric: Ideas and description 3; Organisation 2; Spelling and punctuation 2' };

describe('open answers wait for the teacher', () => {
  it('a written open answer is pending, a blank one is blank, and pending blocks the score', () => {
    const m = markAnswer(SHORT, 'They need light to make food.');
    expect(m).toMatchObject({ status: 'pending', type: 'short', outOf: 2 });
    expect(markAnswer(SHORT, '').status).toBe('blank');
    expect(scoreSheet([m]).pending).toBe(1);
    expect(markAnswer(PASSAGE, 'It rained.').outOf).toBe(7);
  });
});

describe('toSuggestion: code computes the points', () => {
  it('holistic mark decides; missing list names the gaps', () => {
    expect(toSuggestion(SHORT, { mark: 'full', missing: [2], reason: 'ok' }, 'on_device', 1500)).toMatchObject({ points: 2, met: [true, true] });
    expect(toSuggestion(SHORT, { mark: 'none', missing: [], reason: '' }, 'on_device', 1)).toMatchObject({ points: 0, met: [false, false], contradicts: true });
    expect(toSuggestion(SHORT, { mark: 'none', missing: [1, 2], reason: '' }, 'on_device', 1)).toMatchObject({ points: 0, contradicts: false });
    expect(toSuggestion(SHORT, { mark: 'partial', missing: [1], reason: '' }, 'on_device', 1)).toMatchObject({ points: 1, met: [false, true] });
    expect(toSuggestion(SHORT, { mark: 'partial', missing: [], reason: '' }, 'on_device', 1)).toMatchObject({ points: 1, met: [true, false] });
    expect(toSuggestion(SHORT, { mark: 'partial', missing: [1, 2], reason: '' }, 'on_device', 1)).toMatchObject({ points: 1, met: [true, false] });
  });
  it('one key point: partial is half a mark', () => {
    expect(toSuggestion({ q: 1, prompt: '', answer: 'it evaporates', type: 'short' }, { mark: 'partial', missing: [], reason: '' }, 'on_device', 1)?.points).toBe(0.5);
  });
  it('rejects junk and out-of-range numbers', () => {
    expect(toSuggestion(SHORT, { mark: 'great' }, 'on_device', 1)).toBeNull();
    expect(toSuggestion(SHORT, null, 'on_device', 1)).toBeNull();
    expect(toSuggestion(SHORT, { mark: 'partial', missing: [9, 'x', 2] }, 'on_device', 1)).toMatchObject({ met: [true, false] });
    expect(toSuggestion(PASSAGE, { l1: 9, l2: -3, l3: 2, reason: '' }, 'on_device', 1)).toMatchObject({ points: 5, lines: [{ score: 3, max: 3 }, { score: 0, max: 2 }, { score: 2, max: 2 }] });
    expect(toSuggestion(PASSAGE, { l1: 2, reason: '' }, 'on_device', 1)).toBeNull();
  });
});

describe('decideOpen: the teacher decides', () => {
  const pending = markAnswer(SHORT, 'They need light to make food.');
  const sug = toSuggestion(SHORT, { mark: 'partial', missing: [1], reason: 'no energy' }, 'on_device', 1)!;
  it('accepting the suggestion', () => {
    const d = decideOpen(SHORT, { ...pending, suggestion: sug });
    expect(d).toMatchObject({ status: 'partial', points: 1, checked: true, mistakes: ['missing_point_1'] });
    expect(d.flags).not.toContain('teacher_changed');
  });
  it('changing it: the teacher ticks both key points', () => {
    const d = decideOpen(SHORT, { ...pending, suggestion: sug }, { met: [true, true] });
    expect(d).toMatchObject({ status: 'correct', points: 2, mistakes: [] });
    expect(d.flags).toContain('teacher_changed');
  });
  it('setting points without a suggestion', () => {
    expect(decideOpen(SHORT, pending, { points: 0 })).toMatchObject({ status: 'wrong', points: 0 });
    expect(decideOpen(SHORT, pending)).toBe(pending); // nothing to decide from
  });
  it('paragraph lines', () => {
    const p = markAnswer(PASSAGE, 'The rain fell.');
    const d = decideOpen(PASSAGE, p, { lines: [{ score: 1, max: 3 }, { score: 2, max: 2 }, { score: 1, max: 2 }] });
    expect(d).toMatchObject({ status: 'partial', points: 4, mistakes: ['rubric_low_1', 'rubric_low_3'] });
    expect(scoreSheet([d])).toMatchObject({ points: 4, outOf: 7, pending: 0 });
  });
  it('mistake ids stay inside the fixed list', () => {
    expect(openMistakes(SHORT, { met: Array(9).fill(false) })).toHaveLength(6);
  });
});

describe('stripPrinted: printed text copied into an answer is removed by code', async () => {
  const { stripPrinted, markRead } = await import('./pipeline');
  it('removes a copied question', () => {
    expect(stripPrinted('Look at the picture of the bean seedling shortly after germination. Describe the function of each of the parts: seed coat. To protect it.', 'Look at the picture of the bean seedling shortly after germination. Describe the function of each of the parts: seed coat.')).toBe('To protect it.');
    expect(stripPrinted('Why do plants need light? They need it to make food.', 'Why do plants need light?')).toBe('They need it to make food.');
    expect(stripPrinted('Why do plants need light?', 'Why do plants need light?')).toBe('');
  });
  it('keeps answers that only re-use some of the question words', () => {
    expect(stripPrinted('Plants need light to make food.', 'Why do plants need light?')).toBe('Plants need light to make food.');
    expect(stripPrinted('The water evaporates.', 'A puddle disappears on a sunny day. Explain why.')).toBe('The water evaporates.');
    expect(stripPrinted('5/6', '2/3 + 1/6')).toBe('5/6');
    expect(stripPrinted('B', 'Which gas do plants take in? A) oxygen B) carbon dioxide')).toBe('B');
  });
  it('flags the answer for a look', () => {
    const k = { q: 1, prompt: 'Why do plants need light?', answer: 'light gives energy; to make food' };
    const [m] = markRead([k], { answers: [{ q: 1, crossedOutText: '', finalAnswer: 'Why do plants need light? To make food.' }] });
    expect(m.read).toBe('To make food.');
    expect(m.flags).toContain('check_reading');
  });
});
