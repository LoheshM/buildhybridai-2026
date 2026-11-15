// Browser side of the answer sheet: find the corner squares in a photo, undo the perspective, and
// build one image per sheet in which each answer box sits on its own numbered row ("the strip").
// Gemini Nano reads the strip; it never sees the printed question, the options or the neighbours.
import type { QuestionKey } from '../marking/mark';
import { apply, findMarkers, layout, pageToImage, type Box, type H } from './sheet';

const PX_PER_MM = 5; // ~127 dpi: plenty for handwriting, small enough for the on-device model
const DETECT_WIDTH = 1000;

export class LayoutMismatch extends Error {
  constructor() { super("The answer boxes in this photo aren't where this quiz's answer sheet has them. It may be the answer sheet for a different quiz, or badly cut off. Retake it, or check it belongs to this quiz."); this.name = 'LayoutMismatch'; }
}
const FRAME_MIN = 0.6;

export class NoMarkers extends Error {
  constructor() { super("Tickmark couldn't find the four black corner squares. Retake the photo with the whole answer sheet in view, flat and in good light."); this.name = 'NoMarkers'; }
}

export interface Cut { strip: Blob; strips: { blob: Blob; qs: number[] }[]; boxes: Box[]; blank: number[]; name: Blob; preview: Blob; crops: Map<number, Blob>; ms: number }

/**
 * Answer rows per strip. Round 5 (F4-20): Gemini Nano read 6-7-row strips 82.7% exactly but 26-row strips 14.4%
 * (rows shifted by one, later rows empty); the 10-answer maths sheets read 85.7%. Longer sheets are read in chunks.
 */
export const STRIP_ROWS = 10;

/**
 * Share of "ink" pixels inside a box, ignoring a border band (the printed frame and its shadow).
 * Code decides a box is empty: asked about an empty box, Gemini Nano invented an answer.
 */
export function inkShare(c: OffscreenCanvas, borderPx = 13): number {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  const iw = w - 2 * borderPx, ih = h - 2 * borderPx;
  if (iw <= 0 || ih <= 0) return 0;
  const lum = new Float32Array(iw * ih);
  for (let y = 0; y < ih; y++) for (let x = 0; x < iw; x++) { const p = ((y + borderPx) * w + x + borderPx) * 4; lum[y * iw + x] = (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000; }
  const sorted = Float32Array.from(lum).sort();
  const paper = sorted[Math.floor(sorted.length * 0.6)]; // the page's own brightness in this box
  const dark = new Uint8Array(iw * ih);
  for (let i = 0; i < lum.length; i++) dark[i] = lum[i] < paper - 70 ? 1 : 0;
  // straight lines are print (a box edge left in by a slightly skewed photo), not handwriting
  for (let y = 0; y < ih; y++) { let n = 0; for (let x = 0; x < iw; x++) n += dark[y * iw + x]; if (n > iw * 0.4) for (let x = 0; x < iw; x++) dark[y * iw + x] = 0; }
  // columns: only a near-full-height line close to the frame (a skewed box edge); an upright "1" or "l" stays ink
  const edge = 15;
  for (let x = 0; x < iw; x++) { if (x >= edge && x < iw - edge) continue; let n = 0; for (let y = 0; y < ih; y++) n += dark[y * iw + x]; if (n > ih * 0.8) for (let y = 0; y < ih; y++) dark[y * iw + x] = 0; }
  let ink = 0;
  for (const v of dark) ink += v;
  return ink / dark.length;
}
/** The box cut down to the rows that hold handwriting (plus a margin), so the teacher sees the writing, not empty lines. */
export function trimToInk(c: OffscreenCanvas, pad = 14): OffscreenCanvas {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  const lum = (x: number, y: number) => { const p = (y * w + x) * 4; return (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000; };
  const sample: number[] = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) sample.push(lum(x, y));
  sample.sort((a, b) => a - b);
  const paper = sample[Math.floor(sample.length * 0.6)];
  let top = -1, bottom = -1;
  for (let y = 13; y < h - 13; y++) {
    let n = 0;
    for (let x = 13; x < w - 13; x++) if (lum(x, y) < paper - 70) n++;
    // a row with some ink but not a printed line across the box
    if (n > 2 && n < (w - 26) * 0.4) { if (top < 0) top = y; bottom = y; }
  }
  if (top < 0) return c;
  const y0 = Math.max(0, top - pad), y1 = Math.min(h, bottom + pad);
  if (y1 - y0 > h * 0.85) return c;
  const out = new OffscreenCanvas(w, y1 - y0);
  out.getContext('2d')!.drawImage(c, 0, y0, w, y1 - y0, 0, 0, w, y1 - y0);
  return out;
}

/** Page strips (x, y, w, h in mm): the start of the printed title, and the same strip turned 180°, which is blank paper. */
const TITLE_STRIP: [number, number, number, number] = [30, 14, 45, 8];
const BOTTOM_STRIP: [number, number, number, number] = [210 - 30 - 45, 297 - 14 - 8, 45, 8];
/** Share of clearly dark pixels (print or ink) in a canvas. */
function darkShare(c: OffscreenCanvas): number {
  const { data } = c.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
  const lum: number[] = [];
  for (let p = 0; p < data.length; p += 4) lum.push((data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000);
  const paper = [...lum].sort((x, y) => x - y)[Math.floor(lum.length * 0.6)];
  return lum.filter((v) => v < paper - 70).length / lum.length;
}

/**
 * How much of a box's printed frame is where the layout says (0-1). The cut keeps a 1.5 mm margin, so the
 * frame sits about 7 px inside each edge of the box canvas. Boxes cut from another quiz's sheet miss it.
 */
export function frameScore(c: OffscreenCanvas, padPx = Math.round(1.5 * PX_PER_MM), band = 4): number {
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const { data, width: w, height: h } = ctx.getImageData(0, 0, c.width, c.height);
  const lum = (x: number, y: number) => { const p = (y * w + x) * 4; return (data[p] * 299 + data[p + 1] * 587 + data[p + 2] * 114) / 1000; };
  const sample: number[] = [];
  for (let y = 0; y < h; y += 3) for (let x = 0; x < w; x += 3) sample.push(lum(x, y));
  sample.sort((a, b) => a - b);
  const paper = sample[Math.floor(sample.length * 0.6)];
  const dark = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && lum(x, y) < paper - 60;
  let hit = 0, n = 0;
  const near = (x0: number, y0: number, horiz: boolean) => { for (let d = -band; d <= band; d++) if (horiz ? dark(x0, y0 + d) : dark(x0 + d, y0)) return true; return false; };
  for (let x = padPx + 6; x < w - padPx - 6; x += 2) { n += 2; if (near(x, padPx, true)) hit++; if (near(x, h - 1 - padPx, true)) hit++; }
  for (let y = padPx + 6; y < h - padPx - 6; y += 2) { n += 2; if (near(padPx, y, false)) hit++; if (near(w - 1 - padPx, y, false)) hit++; }
  return n ? hit / n : 0;
}

export const BLANK_BELOW = 0.002; // blank boxes measure 0; one handwritten letter about 0.0065

async function bitmapOf(b: Blob) { return createImageBitmap(b, { imageOrientation: 'from-image' }); }

/** Finds the sheet in a photo and returns the strip of answer boxes, the name box and an upright preview. */
export async function cutAnswerSheet(photo: Blob, keys: QuestionKey[]): Promise<Cut> {
  const t0 = performance.now();
  const bmp = await bitmapOf(photo);
  const scale = Math.min(1, DETECT_WIDTH / bmp.width);
  const dw = Math.round(bmp.width * scale), dh = Math.round(bmp.height * scale);
  const small = new OffscreenCanvas(dw, dh);
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bmp, 0, 0, dw, dh);
  const rgba = sctx.getImageData(0, 0, dw, dh).data;
  const gray = new Uint8ClampedArray(dw * dh);
  for (let i = 0; i < dw * dh; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  const found = findMarkers(gray, dw, dh);
  if (!found) { bmp.close(); throw new NoMarkers(); }
  const corners = found.map(([x, y]) => [x / scale, y / scale] as [number, number]);
  let h = pageToImage(corners);
  // full-resolution source pixels for sampling
  const src = new OffscreenCanvas(bmp.width, bmp.height);
  const cctx = src.getContext('2d', { willReadFrequently: true })!;
  cctx.drawImage(bmp, 0, 0);
  const full = cctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  // The four squares are identical, so a photo taken upside down maps every box onto the wrong place.
  // The printed title sits top left and the matching strip at the bottom right is always empty paper:
  // if the bottom strip holds the print, the sheet is upside down, and the corners are swapped round.
  if (darkShare(warp(full, h, ...BOTTOM_STRIP)) > 2 * darkShare(warp(full, h, ...TITLE_STRIP)) + 0.004) {
    h = pageToImage([corners[2], corners[3], corners[0], corners[1]]);
  }
  const boxes = layout(keys);
  const cut = (b: Box) => boxCanvas(full, h, b);
  const nameCanvas = cut(boxes[0]);
  const name = await nameCanvas.convertToBlob({ type: 'image/png' });
  const answers = boxes.slice(1).map((b) => ({ b, c: cut(b) }));
  // Round 5 (F4-02): every printed frame must be where this quiz's layout puts it. On all 70 sample photos every
  // box scores 1.0; a photo of another quiz's sheet has at least one box below 0.6. A sheet with the same layout
  // from another quiz can't be told apart this way.
  if ([nameCanvas, ...answers.map(({ c }) => c)].some((c) => frameScore(c) < FRAME_MIN)) throw new LayoutMismatch();
  const blank = answers.filter(({ c }) => inkShare(c) < BLANK_BELOW).map(({ b }) => b.q);
  const written = answers.filter(({ b }) => !blank.includes(b.q));
  // the name box rides on the same strip, so one on-device call reads the whole sheet
  // each chunk repeats the Name row, so every strip is read with the same prompt
  const strips: { blob: Blob; qs: number[] }[] = [];
  for (let i = 0; i === 0 || i < written.length; i += STRIP_ROWS) {
    const part = written.slice(i, i + STRIP_ROWS);
    strips.push({ blob: await stripOf([{ label: 'Name', c: nameCanvas }, ...part.map(({ b, c }) => ({ label: String(b.q), c }))]).convertToBlob({ type: 'image/jpeg', quality: 0.9 }), qs: part.map(({ b }) => b.q) });
  }
  const strip = strips[0].blob;
  const preview = await warp(full, h, 0, 0, 210, 297, 2.4).convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  // each box's handwriting, kept so the teacher always sees what the pupil wrote beside what Nano read
  const crops = new Map<number, Blob>();
  for (const { b, c } of answers) crops.set(b.q, await trimToInk(c).convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
  return { strip, strips, boxes, blank, name, preview, crops, ms: Math.round(performance.now() - t0) };
}

/** One box (with a 1.5 mm margin for its frame) cut out of the photo. */
const boxCanvas = (full: ImageData, h: H, b: Box, pad = 1.5) => warp(full, h, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);

/** For benches: every answer box of a photo as the canvas the strip is built from (same cut as cutAnswerSheet). */
export async function answerBoxes(photo: Blob, keys: QuestionKey[]): Promise<{ q: number; c: OffscreenCanvas; blank: boolean; frame: number }[]> {
  const bmp = await bitmapOf(photo);
  const scale = Math.min(1, DETECT_WIDTH / bmp.width);
  const dw = Math.round(bmp.width * scale), dh = Math.round(bmp.height * scale);
  const small = new OffscreenCanvas(dw, dh);
  const sctx = small.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bmp, 0, 0, dw, dh);
  const rgba = sctx.getImageData(0, 0, dw, dh).data;
  const gray = new Uint8ClampedArray(dw * dh);
  for (let i = 0; i < dw * dh; i++) gray[i] = (rgba[i * 4] * 299 + rgba[i * 4 + 1] * 587 + rgba[i * 4 + 2] * 114) / 1000;
  const found = findMarkers(gray, dw, dh);
  if (!found) { bmp.close(); throw new NoMarkers(); }
  const h = pageToImage(found.map(([x, y]) => [x / scale, y / scale] as [number, number]));
  const src = new OffscreenCanvas(bmp.width, bmp.height);
  const cctx = src.getContext('2d', { willReadFrequently: true })!;
  cctx.drawImage(bmp, 0, 0);
  const full = cctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return layout(keys).slice(1).map((b) => { const c = boxCanvas(full, h, b); return { q: b.q, c, blank: inkShare(c) < BLANK_BELOW, frame: frameScore(c) }; });
}

/** For benches: the strip image for any list of labelled boxes. */
export const stripImage = (rows: { label: string; c: OffscreenCanvas }[]) => stripOf(rows).convertToBlob({ type: 'image/jpeg', quality: 0.9 });

/** Samples a page rectangle (mm) out of the photo through the homography, bilinear. */
function warp(img: ImageData, h: H, x: number, y: number, w: number, hgt: number, ppm = PX_PER_MM): OffscreenCanvas {
  const ow = Math.round(w * ppm), oh = Math.round(hgt * ppm);
  const out = new OffscreenCanvas(ow, oh);
  const ctx = out.getContext('2d')!;
  const dst = ctx.createImageData(ow, oh);
  const { width: W, height: Hh, data } = img;
  for (let j = 0; j < oh; j++) for (let i = 0; i < ow; i++) {
    const [u, v] = apply(h, x + (i + 0.5) / ppm, y + (j + 0.5) / ppm);
    const o = (j * ow + i) * 4;
    if (u < 0 || v < 0 || u >= W - 1 || v >= Hh - 1) { dst.data[o] = dst.data[o + 1] = dst.data[o + 2] = 255; dst.data[o + 3] = 255; continue; }
    const x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0;
    for (let c = 0; c < 3; c++) {
      const p = (y0 * W + x0) * 4 + c;
      const top = data[p] * (1 - fx) + data[p + 4] * fx;
      const bot = data[p + W * 4] * (1 - fx) + data[p + W * 4 + 4] * fx;
      dst.data[o + c] = top * (1 - fy) + bot * fy;
    }
    dst.data[o + 3] = 255;
  }
  ctx.putImageData(dst, 0, 0);
  return out;
}

/** Each box on its own row, framed, with its number printed large in a left margin. */
function stripOf(rows: { label: string; c: OffscreenCanvas }[]): OffscreenCanvas {
  const margin = 110, gap = 14;
  const w = Math.max(...rows.map((r) => r.c.width)) + margin + 10;
  const h = rows.reduce((a, r) => a + r.c.height + gap, gap);
  const out = new OffscreenCanvas(w, h);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  let y = gap;
  for (const r of rows) {
    ctx.strokeStyle = '#777'; ctx.lineWidth = 2; ctx.strokeRect(2, y - 6, w - 4, r.c.height + 12);
    ctx.fillStyle = '#000'; ctx.font = `bold ${r.label.length > 2 ? 26 : 34}px Arial, sans-serif`; ctx.fillText(r.label, 14, y + 34);
    ctx.drawImage(r.c, margin, y);
    y += r.c.height + gap;
  }
  return out;
}
