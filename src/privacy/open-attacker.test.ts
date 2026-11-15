// The exact attacker for open questions. A short answer with key points produces overlapping labels
// ("missed key point 1", "missed key point 2"): a pupil can miss both. Enumerate every class (every
// mix of answer kinds) up to a size, publish each with questionCells, and group classes by what is
// published. A hidden cell leaks if every class behind that output agrees on its value.
import { describe, expect, it } from 'vitest';
import { questionCells } from './aggregate';

/** All multisets of `n` items over `kinds` kinds, as count vectors. */
function mixes(n: number, kinds: number): number[][] {
  if (kinds === 1) return [[n]];
  const out: number[][] = [];
  for (let v = 0; v <= n; v++) for (const rest of mixes(n - v, kinds - 1)) out.push([v, ...rest]);
  return out;
}

function attack(points: number, maxN: number, k: number, visibleCap: number) {
  // answer kinds = subsets of key points missed (bitmask); 0 = full marks, all = no marks
  const kinds = 1 << points;
  const byOutput = new Map<string, number[][]>();
  for (let n = 1; n <= maxN; n++) {
    for (const mix of mixes(n, kinds)) {
      let right = 0, partial = 0, wrong = 0;
      const missed = Array(points).fill(0);
      mix.forEach((c, mask) => {
        if (!c) return;
        if (mask === 0) right += c; else if (mask === kinds - 1) wrong += c; else partial += c;
        for (let p = 0; p < points; p++) if (mask & (1 << p)) missed[p] += c;
      });
      const groups = missed.map((v, p) => [`missing_point_${p + 1}`, v] as [string, number]).filter(([, v]) => v > 0);
      const out = JSON.stringify(questionCells(right, partial, wrong, groups, k));
      const state = [right, partial, wrong, ...missed];
      const list = byOutput.get(out) ?? [];
      list.push(state);
      byOutput.set(out, list);
    }
  }
  const leaks: string[] = [];
  let judged = 0;
  for (const [out, states] of byOutput) {
    const o = JSON.parse(out);
    const visible = [o.right, o.partial, o.wrong, ...Object.values(o.mistakes)];
    if (visible.some((v) => typeof v === 'number' && v > visibleCap)) continue; // near the enumeration edge
    // the class size is not published: skip outputs whose hidden cells could only be small because
    // bigger classes were not enumerated
    const shown = [o.right, o.partial, o.wrong].reduce((a: number, v) => a + (typeof v === 'number' ? v : k - 1), 0);
    if (shown > maxN) continue;
    judged++;
    const cells: [string, unknown, number][] = [['right', o.right, 0], ['partial', o.partial, 1], ['wrong', o.wrong, 2]];
    for (let p = 0; p < points; p++) cells.push([`missing_point_${p + 1}`, o.mistakes[`missing_point_${p + 1}`], 3 + p]);
    for (const [name, v, i] of cells) if (v === 'hidden' && new Set(states.map((s) => s[i])).size < 2) leaks.push(`${name} in ${out}`);
  }
  return { leaks, judged };
}

describe('open questions: overlapping "missed key point" counts never pin a hidden count', () => {
  it('two key points, every class up to 12 pupils, k = 3', () => {
    const r = attack(2, 12, 3, 6);
    expect(r.judged).toBeGreaterThan(50);
    expect(r.leaks).toEqual([]);
  });
  it('three key points, every class up to 9 pupils, k = 3', () => {
    const r = attack(3, 9, 3, 4);
    expect(r.judged).toBeGreaterThan(20);
    expect(r.leaks).toEqual([]);
  });
  it('two key points, k = 4', () => {
    const r = attack(2, 12, 4, 6);
    expect(r.leaks).toEqual([]);
  });
});
