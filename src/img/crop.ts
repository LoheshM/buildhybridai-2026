// Browser side of the answer sheet: find the corner squares in a photo, undo the perspective, and
// build one image per sheet in which each answer box sits on its own numbered row ("the strip").
// Gemini Nano reads the strip; it never sees the printed question, the options or the neighbours.
import type { QuestionKey } from '../marking/mark';
import { apply, findMarkers, layout, pageToImage, type Box, type H } from './sheet';

const PX_PER_MM = 5; // ~127 dpi: plenty for handwriting, small enough for the on-device model
const DETECT_WIDTH = 1000;

export class NoMarkers extends Error {
  constructor() { super("Tickmark couldn't find the four black corner squares. Retake the photo with the whole answer sheet in view, flat and in good light."); this.name = 'NoMarkers'; }
}

export interface Cut { strip: Blob; boxes: Box[]; blank: number[]; name: Blob; preview: Blob; crops: Map<number, Blob>; ms: number }

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
  for (let x = 0; x < iw; x++) { let n = 0; for (let y = 0; y < ih; y++) n += dark[y * iw + x]; if (n > ih * 0.4) for (let y = 0; y < ih; y++) dark[y * iw + x] = 0; }
  let ink = 0;
  for (const v of dark) ink += v;
  return ink / dark.length;
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
  const h = pageToImage(found.map(([x, y]) => [x / scale, y / scale] as [number, number]));
  // full-resolution source pixels for sampling
  const src = new OffscreenCanvas(bmp.width, bmp.height);
  const cctx = src.getContext('2d', { willReadFrequently: true })!;
  cctx.drawImage(bmp, 0, 0);
  const full = cctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  const boxes = layout(keys);
  const cut = (b: Box, pad = 1.5) => warp(full, h, b.x - pad, b.y - pad, b.w + 2 * pad, b.h + 2 * pad);
  const nameCanvas = cut(boxes[0]);
  const name = await nameCanvas.convertToBlob({ type: 'image/png' });
  const answers = boxes.slice(1).map((b) => ({ b, c: cut(b) }));
  const blank = answers.filter(({ c }) => inkShare(c) < BLANK_BELOW).map(({ b }) => b.q);
  const written = answers.filter(({ b }) => !blank.includes(b.q));
  // the name box rides on the same strip, so one on-device call reads the whole sheet
  const strip = await stripOf([{ label: 'Name', c: nameCanvas }, ...written.map(({ b, c }) => ({ label: String(b.q), c }))]).convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  const preview = await warp(full, h, 0, 0, 210, 297, 2.4).convertToBlob({ type: 'image/jpeg', quality: 0.8 });
  // each box's handwriting, kept so the teacher always sees what the pupil wrote beside what Nano read
  const crops = new Map<number, Blob>();
  for (const { b, c } of answers) crops.set(b.q, await c.convertToBlob({ type: 'image/jpeg', quality: 0.8 }));
  return { strip, boxes, blank, name, preview, crops, ms: Math.round(performance.now() - t0) };
}

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
