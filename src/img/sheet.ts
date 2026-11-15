// The Tickmark answer sheet: pupils answer any worksheet in numbered boxes on a printed sheet with
// four solid corner squares. Code finds the squares in a photo, undoes the perspective and cuts out
// each box, so Gemini Nano reads one box at a time and never sees the question it could "answer".
// (15 Nov bench: reading whole worksheets, Nano filled in blanks, flipped True/False and corrected
// misspellings; 15-40% of exact answers got the wrong mark with no flag.)
// Pure: no DOM. Units are millimetres on an A4 page (210 x 297).
import type { QuestionKey } from '../marking/mark';
import { typeOf } from '../marking/mark';

export const PAGE = { w: 210, h: 297 };
export const MARKER = { size: 12, inset: 10 }; // solid squares, 10 mm from each corner
export interface Box { q: number; x: number; y: number; w: number; h: number; lines: number } // q = 0 is the name box

/** Marker centres in page millimetres: top-left, top-right, bottom-right, bottom-left. */
export const markerCentres = (): [number, number][] => {
  const c = MARKER.inset + MARKER.size / 2;
  return [[c, c], [PAGE.w - c, c], [PAGE.w - c, PAGE.h - c], [c, PAGE.h - c]];
};

const LINE = 9; // mm per handwriting line
const linesFor = (k: QuestionKey) => { const t = typeOf(k); return t === 'passage' ? 9 : t === 'short' ? 3 : 1; };

/**
 * Deterministic layout from the quiz key: the printed sheet and the reader compute the same boxes.
 * Exact answers sit two to a row; short answers and paragraphs take the full width.
 * Throws if the answers don't fit on one page.
 */
export function layout(keys: QuestionKey[]): Box[] {
  const left = MARKER.inset + MARKER.size + 6, right = PAGE.w - left, top = 44, bottom = PAGE.h - MARKER.inset - MARKER.size - 4;
  const boxes: Box[] = [{ q: 0, x: 118, y: 24, w: right - 118, h: 13, lines: 1 }];
  const full = right - left, gap = 12, half = (full - gap) / 2; // the gap holds the right column's box numbers
  let y = top, col = 0;
  for (const k of keys) {
    const lines = linesFor(k);
    const h = Math.max(13, lines * LINE + 4);
    if (lines === 1) {
      boxes.push({ q: k.q, x: left + col * (half + gap), y, w: half, h, lines });
      if (col === 1) { y += h + 4; col = 0; } else col = 1;
    } else {
      if (col === 1) { y += 13 + 4; col = 0; }
      boxes.push({ q: k.q, x: left, y, w: full, h, lines });
      y += h + 4;
    }
  }
  if (col === 1) y += 13 + 4;
  if (y > bottom) throw new Error(`These ${keys.length} answers don't fit on one answer sheet. Split the quiz into two.`);
  return boxes;
}

// ---------------------------------------------------------------- homography (4-point, DLT)
export type H = number[]; // 3x3 row-major, h[8] = 1

/** Solves the projective map that sends src[i] to dst[i] (four point pairs). */
export function homography(src: [number, number][], dst: [number, number][]): H {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let c = 0; c < 8; c++) { // Gauss-Jordan with partial pivoting
    let p = c;
    for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    if (Math.abs(A[c][c]) < 1e-12) throw new Error('degenerate marker positions');
    for (let r = 0; r < 8; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let k = c; k < 9; k++) A[r][k] -= f * A[c][k];
    }
  }
  return [...Array.from({ length: 8 }, (_, i) => A[i][8] / A[i][i]), 1];
}

export const apply = (h: H, x: number, y: number): [number, number] => {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
};

// ---------------------------------------------------------------- finding the four squares
export interface Blob { cx: number; cy: number; w: number; h: number; area: number }

/** Otsu threshold of an 8-bit grayscale image. */
export function otsu(gray: Uint8ClampedArray | Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (const g of gray) hist[g]++;
  const total = gray.length;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = 0, t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i]; if (!wB) continue;
    const wF = total - wB; if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) { best = between; t = i; }
  }
  return t;
}

/** Dark, solid, square-ish blobs (4-connected components). */
export function squares(gray: Uint8ClampedArray | Uint8Array, w: number, h: number, threshold = otsu(gray)): Blob[] {
  const dark = new Uint8Array(w * h);
  // a little darker than Otsu: pencil and handwriting are lighter than a printed black square
  const t = Math.min(threshold, 110);
  for (let i = 0; i < w * h; i++) dark[i] = gray[i] < t ? 1 : 0;
  const seen = new Uint8Array(w * h);
  const out: Blob[] = [];
  const stack: number[] = [];
  const minSide = Math.max(6, Math.round(Math.min(w, h) * 0.02)), maxSide = Math.round(Math.min(w, h) * 0.12);
  for (let i = 0; i < w * h; i++) {
    if (!dark[i] || seen[i]) continue;
    let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0, sx = 0, sy = 0;
    stack.push(i); seen[i] = 1;
    while (stack.length) {
      const p = stack.pop()!;
      const x = p % w, y = (p / w) | 0;
      n++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h || seen[q] || !dark[q]) continue;
        if ((q === p - 1 && x === 0) || (q === p + 1 && x === w - 1)) continue;
        seen[q] = 1; stack.push(q);
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (bw < minSide || bh < minSide || bw > maxSide || bh > maxSide) continue;
    const aspect = bw / bh, fill = n / (bw * bh);
    if (aspect < 0.6 || aspect > 1.65 || fill < 0.72) continue;
    out.push({ cx: sx / n, cy: sy / n, w: bw, h: bh, area: n });
  }
  return out;
}

/**
 * The four corner squares: for each image corner, the solid square nearest to it, among squares
 * of a similar size. Returns TL, TR, BR, BL centres, or null when four can't be found.
 */
export function findMarkers(gray: Uint8ClampedArray | Uint8Array, w: number, h: number): [number, number][] | null {
  const all = squares(gray, w, h);
  // the printed squares are the biggest solid squares on the page; specks of desk or shadow are smaller
  const maxArea = Math.max(0, ...all.map((b) => b.area));
  const blobs = all.filter((b) => b.area >= maxArea * 0.45);
  if (blobs.length < 4) return null;
  const corners: [number, number][] = [[0, 0], [w, 0], [w, h], [0, h]];
  const pick = corners.map(([x, y]) => blobs.reduce((b, c) => (Math.hypot(c.cx - x, c.cy - y) < Math.hypot(b.cx - x, b.cy - y) ? c : b)));
  if (new Set(pick).size !== 4) return null;
  const areas = pick.map((b) => b.area), mx = Math.max(...areas), mn = Math.min(...areas);
  if (mn < mx * 0.35) return null; // four squares of one size, not a blob of handwriting
  // each must sit in its own quadrant
  const [tl, tr, br, bl] = pick;
  if (!(tl.cx < w / 2 && tl.cy < h / 2 && tr.cx > w / 2 && tr.cy < h / 2 && br.cx > w / 2 && br.cy > h / 2 && bl.cx < w / 2 && bl.cy > h / 2)) return null;
  return pick.map((b) => [b.cx, b.cy] as [number, number]);
}

/** Page millimetres → image pixels, from the four marker centres found in the photo. */
export const pageToImage = (found: [number, number][]): H => homography(markerCentres(), found);
