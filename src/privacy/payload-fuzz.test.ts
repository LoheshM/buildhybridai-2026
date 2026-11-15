// Round 5 (S2/E12): whatever a teacher types as a question or key, the class totals either pass the strict
// validator or leave that text out. A plan must never be blocked for good by ordinary worksheet text.
import { describe, expect, it } from 'vitest';
import { keyProblem, markAnswer, type QuestionKey } from '../marking/mark';
import type { QType } from '../marking/qtypes';
import { buildTotals, validatePayload } from './aggregate';

// small seeded PRNG (mulberry32) so a failure is reproducible
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const POOLS = [
  'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789 .,/', ' ;:!?\'"()[]{}<>_*#@^~`|\\', '–—‘’“”…→⇒≥≤×÷±°%£$€₹¢',
  'नमस्ते विद्यार्थी प्रकाश संश्लेषण', 'தமிழ் ஒளிச்சேர்க்கை மாணவர்', 'éèêëàâçñöü', '😀🌱✓✗★', '\t\n\r​ ',
];
const text = (r: () => number, max: number) => {
  const n = Math.floor(r() * max);
  let s = '';
  for (let i = 0; i < n; i++) { const p = POOLS[Math.floor(r() * POOLS.length)]; s += [...p][Math.floor(r() * [...p].length)]; }
  return s;
};
const TYPES: QType[] = ['fraction', 'number', 'algebra', 'choice', 'word', 'short', 'passage'];

describe('payload fuzz: teacher text never blocks the plan', () => {
  it('2000 random keys and questions over every type pass validation (or are refused when typed)', () => {
    const r = rng(20261115);
    let built = 0;
    for (let i = 0; i < 2000; i++) {
      const type = TYPES[i % TYPES.length];
      const key: QuestionKey = { q: 1 + (i % 12), prompt: text(r, 200), answer: text(r, 120), type };
      if (keyProblem(key)) continue; // New quiz refuses this key before it is ever saved
      const sheets = Array.from({ length: 6 }, () => ({ marks: [markAnswer(key, text(r, 20) || 'x')] }));
      const t = buildTotals([key], sheets, 3, ['en']);
      expect(() => validatePayload(t), JSON.stringify(key)).not.toThrow();
      built++;
    }
    expect(built).toBeGreaterThan(500); // random maths keys are mostly refused by New quiz; text types all build
  });
  it('named cases from round 5', () => {
    const cases: [string, string][] = [
      ['Plants make food by ________.', 'photosynthesis'], ['Name the gas — plants take it in', 'carbon dioxide'], ['What does ‘osmosis’ mean?', 'water moves; through a membrane'],
      ['Write the word', 'photosynthesis / photosynthesizing / photosynthesise'], ['Energy chain', 'glucose → energy; stored as starch'], ['Cost?', '50 cents'],
      ['ஒளிச்சேர்க்கை என்றால் என்ன?', 'ஒளி; உணவு'], ['Simplify 2a × b', '2ab'], ['Area', '3.14 (2 dp)'],
    ];
    for (const [prompt, answer] of cases) {
      const key: QuestionKey = { q: 1, prompt, answer };
      const sheets = Array.from({ length: 6 }, () => ({ marks: [markAnswer(key, 'zzz')] }));
      expect(() => validatePayload(buildTotals([key], sheets, 3, ['en'])), prompt).not.toThrow();
    }
  });
});
