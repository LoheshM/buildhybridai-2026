// Image provenance. The only way to obtain a SampleImage is classify() matching the SHA-256 of
// a built-in synthetic sheet; everything else is a StudentImage and can only be read on-device.
import { sha256Hex } from './netGuard';

declare const brand: unique symbol;
export type StudentImage = { readonly [brand]: 'student'; base64: string; mime: 'image/jpeg' | 'image/png'; sha256: string };
export type SampleImage = { readonly [brand]: 'sample'; base64: string; mime: 'image/jpeg'; sha256: string; sampleId: string };

let sampleHashes = new Map<string, string>(); // sha256 -> sample id
export const setSampleHashes = (m: Map<string, string>) => { sampleHashes = m; };

export async function blobToBase64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Classifies image bytes exactly as they will be sent. */
export async function classify(bytes: Blob): Promise<StudentImage | SampleImage> {
  const sha256 = await sha256Hex(await bytes.arrayBuffer());
  const base64 = await blobToBase64(bytes);
  const sampleId = sampleHashes.get(sha256);
  if (sampleId && bytes.type === 'image/jpeg') return { base64, mime: 'image/jpeg', sha256, sampleId } as unknown as SampleImage;
  const mime = bytes.type === 'image/png' ? 'image/png' : 'image/jpeg';
  return { base64, mime, sha256 } as unknown as StudentImage;
}

export const isSample = (i: StudentImage | SampleImage): i is SampleImage => 'sampleId' in i && !!(i as SampleImage).sampleId;

export class UnsupportedImage extends Error {
  constructor(msg: string) { super(msg); this.name = 'UnsupportedImage'; }
}

/**
 * Normalises a teacher's photo before it is stored or read: applies EXIF rotation, scales the
 * long side to at most 1600 px and re-encodes as JPEG, which also strips EXIF (GPS, device).
 */
export async function normalizeUpload(file: File): Promise<Blob> {
  const name = file.name.toLowerCase();
  if (/\.(heic|heif)$/.test(name) || /heic|heif/.test(file.type)) {
    throw new UnsupportedImage('iPhone HEIC photos are not supported yet. On the iPhone choose Settings → Camera → Formats → Most Compatible, or export as JPEG.');
  }
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) && !/\.(jpe?g|png|webp)$/.test(name)) {
    throw new UnsupportedImage(`${file.name} is not a JPEG or PNG photo.`);
  }
  if (file.size > 25 * 1024 * 1024) throw new UnsupportedImage(`${file.name} is larger than 25 MB.`);
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  if (Math.min(bmp.width, bmp.height) < 600) { bmp.close(); throw new UnsupportedImage(`${file.name} is too small to read (${bmp.width}×${bmp.height}). Use the phone's full-size photo.`); }
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
}
