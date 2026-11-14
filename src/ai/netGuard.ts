// The last line of defence for the privacy promise. Installed before Firebase loads, it wraps
// window.fetch and inspects every request to the Firebase AI Logic host:
//   1. while a student task holds the lock, every AI request is refused;
//   2. any image (inlineData) whose SHA-256 is not a known synthetic sample is refused;
//   3. any text containing a roster word is refused.
// Every request that does leave is reported (with its exact body) so the Outbox can show it.
// Why: the SDK sends even ONLY_ON_DEVICE requests to the cloud when the browser has no
// on-device model API (verified in @firebase/ai 3.1.0), so we must not rely on modes alone.
import { AI_HOST } from '../config';
import { findRosterNames, stringValues } from '../privacy/nameCheck';
import { FIXED_VOCAB } from './prompts';

export interface OutboundEvent {
  at: number;
  path: string;
  bytes: number;
  /** Request body as sent, with image data replaced by its fingerprint (and withheld text removed when blocked). */
  body: string;
  blocked: boolean;
  reason?: string;
  images: number;
  /** Images whose fingerprint is not a sample sheet (always 0 for requests that were allowed). */
  nonSampleImages: number;
}

type Listener = (e: OutboundEvent) => void;
const listeners = new Set<Listener>();
let studentLocks = 0;
let allowedImageHashes = new Set<string>();
let rosterTokens: string[] = [];
let installed = false;
let blocks = 0;
let lastReason: string | undefined;

/** How many requests the guard has refused so far, and why the last one was refused. */
export const blockCount = () => blocks;
export const lastBlockReason = () => lastReason;

export const onOutbound = (l: Listener) => { listeners.add(l); return () => listeners.delete(l); };
export const setAllowedImageHashes = (h: Iterable<string>) => { allowedImageHashes = new Set(h); };
export const setRosterTokens = (t: string[]) => { rosterTokens = t; };
export const studentLockHeld = () => studentLocks > 0;

/** Run `fn` with the student lock held: no AI request may leave the browser meanwhile. */
export async function withStudentLock<T>(fn: () => Promise<T>): Promise<T> {
  studentLocks++;
  try { return await fn(); } finally { studentLocks--; }
}

export class GuardBlocked extends Error {
  reason: string;
  constructor(reason: string) { super(`Tickmark blocked a request: ${reason}`); this.name = 'GuardBlocked'; this.reason = reason; }
}

export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const d = await crypto.subtle.digest('SHA-256', buf as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Inspects a request body. Returns a block reason, or null if it may go. Exported for tests. */
export interface Inspection { reason: string | null; images: number; nonSampleImages: number; sanitized: string }

/** Replaces image data with its fingerprint, so the Outbox never stores a photo. */
async function sanitize(json: unknown, withholdText: boolean): Promise<string> {
  const walk = async (v: unknown): Promise<unknown> => {
    if (Array.isArray(v)) return Promise.all(v.map(walk));
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === 'inlineData' && x && typeof (x as { data?: unknown }).data === 'string') {
          const d = (x as { data: string; mimeType?: string });
          out[k] = { mimeType: d.mimeType, data: `<image sha256=${(await sha256Hex(b64ToBytes(d.data))).slice(0, 16)}… ${Math.round((d.data.length * 3) / 4 / 1024)} KB>` };
        } else if (k === 'text' && typeof x === 'string' && withholdText) out[k] = '[withheld: it contained a name from your class list]';
        else out[k] = await walk(x);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(await walk(json));
}

export async function inspectBody(bodyText: string): Promise<Inspection> {
  let json: unknown;
  try { json = JSON.parse(bodyText || '{}'); } catch { return { reason: 'unreadable request body', images: 0, nonSampleImages: 0, sanitized: '' }; }
  const r = await inspectJson(json);
  return { ...r, sanitized: await sanitize(json, r.reason?.startsWith('text') ?? false) };
}

async function inspectJson(json: unknown): Promise<{ reason: string | null; images: number; nonSampleImages: number }> {
  if (studentLocks > 0) return { reason: 'a student sheet was being read on this laptop', images: 0, nonSampleImages: 0 };
  const images: string[] = [];
  const texts: string[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      const inline = o.inlineData as { data?: string } | undefined;
      if (inline && typeof inline.data === 'string') images.push(inline.data);
      if (typeof o.text === 'string') texts.push(o.text);
      for (const [k, x] of Object.entries(o)) if (k !== 'inlineData' && k !== 'text') walk(x);
    }
  };
  walk((json as Record<string, unknown>).contents ?? json);
  let nonSample = 0;
  for (const img of images) if (!allowedImageHashes.has(await sha256Hex(b64ToBytes(img)))) nonSample++;
  if (nonSample) return { reason: 'an image that is not a Tickmark sample sheet', images: images.length, nonSampleImages: nonSample };
  const sys = (json as Record<string, unknown>).systemInstruction;
  const hits = findRosterNames([...texts, ...stringValues(sys)].join('\n'), rosterTokens, FIXED_VOCAB);
  if (hits.length) return { reason: 'text containing a name from your class list', images: images.length, nonSampleImages: 0 };
  return { reason: null, images: images.length, nonSampleImages: 0 };
}

export function installNetGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.hostname !== AI_HOST) return orig(input, init);
    const body = typeof init?.body === 'string' ? init.body
      : input instanceof Request ? await input.clone().text().catch(() => '[non-text body]')
      : init?.body ? '[non-text body]' : '';
    const r = body === '[non-text body]' ? { reason: 'non-text request body', images: 0, nonSampleImages: 0, sanitized: '' } : await inspectBody(body);
    const reason = r.reason;
    const ev: OutboundEvent = { at: Date.now(), path: url.pathname.replace(/^.*\/models\//, 'models/'), bytes: new Blob([body]).size, body: r.sanitized, blocked: !!reason, reason: reason ?? undefined, images: r.images, nonSampleImages: r.nonSampleImages };
    listeners.forEach((l) => l(ev));
    if (reason) { blocks++; lastReason = reason; throw new GuardBlocked(reason); }
    return orig(input, init);
  };
}
