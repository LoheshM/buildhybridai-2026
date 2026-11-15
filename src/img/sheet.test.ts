import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { QuestionKey } from '../marking/mark';
import { apply, findMarkers, homography, layout, markerCentres, PAGE, pageToImage } from './sheet';

const keysOf = (c: string): QuestionKey[] => JSON.parse(readFileSync(new URL(`../../public/samples/${c}/manifest.json`, import.meta.url), 'utf8')).quiz.questions.map((q: { q: number; prompt: string; key: string }) => ({ q: q.q, prompt: q.prompt, answer: q.key }));

describe('answer sheet layout', () => {
  it.each(['maths', 'science', 'english'])('%s fits on one page, boxes inside the markers and not overlapping', (c) => {
    const b = layout(keysOf(c));
    expect(b.length).toBe(keysOf(c).length + 1);
    for (const x of b) {
      expect(x.x).toBeGreaterThan(22); expect(x.x + x.w).toBeLessThan(PAGE.w - 22);
      expect(x.y + x.h).toBeLessThan(PAGE.h - 22);
    }
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const a = b[i], d = b[j];
      const overlap = a.x < d.x + d.w && d.x < a.x + a.w && a.y < d.y + d.h && d.y < a.y + a.h;
      expect(overlap, `${a.q} and ${d.q}`).toBe(false);
    }
  });
  it('refuses a quiz that cannot fit', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ q: i + 1, prompt: '', answer: 'Rubric: Ideas 3; Organisation 2' }));
    expect(() => layout(many)).toThrow(/don't fit/);
  });
});

describe('homography', () => {
  it('maps the four points and round-trips', () => {
    const src = markerCentres();
    const dst: [number, number][] = [[103, 88], [1012, 120], [990, 1400], [80, 1360]];
    const h = homography(src, dst);
    src.forEach((p, i) => { const [u, v] = apply(h, ...p); expect(u).toBeCloseTo(dst[i][0], 6); expect(v).toBeCloseTo(dst[i][1], 6); });
  });
});

describe('finding the corner squares', () => {
  // a synthetic photo: white page, tilted by a homography, four black squares, a few dark scribbles
  const W = 900, H = 1240;
  const truth: [number, number][] = [[70, 60], [840, 85], [860, 1180], [50, 1150]];
  const toImg = homography(markerCentres(), truth);
  const toPage = homography(truth, markerCentres());
  const gray = new Uint8ClampedArray(W * H).fill(200);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [px, py] = apply(toPage, x, y);
    if (px < 0 || py < 0 || px > PAGE.w || py > PAGE.h) { gray[y * W + x] = 90; continue; } // dark desk
    gray[y * W + x] = 236;
    for (const [mx, my] of markerCentres()) if (Math.abs(px - mx) <= 6 && Math.abs(py - my) <= 6) gray[y * W + x] = 20;
    if (py > 60 && py < 62 && px > 40 && px < 160) gray[y * W + x] = 60; // a handwriting stroke
  }
  it('finds all four, in order, within a few pixels', () => {
    const found = findMarkers(gray, W, H);
    expect(found).not.toBeNull();
    found!.forEach((p, i) => { expect(Math.hypot(p[0] - truth[i][0], p[1] - truth[i][1])).toBeLessThan(3); });
    const h = pageToImage(found!);
    const [u, v] = apply(h, PAGE.w / 2, PAGE.h / 2);
    const [eu, ev] = apply(toImg, PAGE.w / 2, PAGE.h / 2);
    expect(Math.hypot(u - eu, v - ev)).toBeLessThan(4);
  });
  it('says no when a square is missing', () => {
    const g = gray.slice();
    const [mx, my] = truth[2];
    for (let y = my - 30; y < my + 30; y++) for (let x = mx - 30; x < mx + 30; x++) g[y * W + x] = 236;
    expect(findMarkers(g, W, H)).toBeNull();
  });
});
