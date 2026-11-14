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

export interface OutboundEvent {
  at: number;
  path: string;
  bytes: number;
  body: string; // exact request body (JSON text)
  blocked: boolean;
  reason?: string;
  images: number;
}

type Listener = (e: OutboundEvent) => void;
const listeners = new Set<Listener>();
let studentLocks = 0;
let allowedImageHashes = new Set<string>();
let rosterTokens: string[] = [];
let installed = false;

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
export async function inspectBody(bodyText: string): Promise<{ reason: string | null; images: number }> {
  if (studentLocks > 0) return { reason: 'a student sheet was being read on this laptop', images: 0 };
  let json: unknown;
  try { json = JSON.parse(bodyText || '{}'); } catch { return { reason: 'unreadable request body', images: 0 }; }
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
  for (const img of images) {
    const h = await sha256Hex(b64ToBytes(img));
    if (!allowedImageHashes.has(h)) return { reason: 'an image that is not a Tickmark sample sheet', images: images.length };
  }
  const sys = (json as Record<string, unknown>).systemInstruction;
  const hits = findRosterNames([...texts, ...stringValues(sys)].join('\n'), rosterTokens);
  if (hits.length) return { reason: 'text containing a name from your class list', images: images.length };
  return { reason: null, images: images.length };
}

export function installNetGuard() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.hostname !== AI_HOST) return orig(input, init);
    const body = typeof init?.body === 'string' ? init.body : init?.body ? '[non-text body]' : '';
    const { reason, images } = body === '[non-text body]' ? { reason: 'non-text request body', images: 0 } : await inspectBody(body);
    const ev: OutboundEvent = { at: Date.now(), path: url.pathname.replace(/^.*\/models\//, 'models/'), bytes: new Blob([body]).size, body, blocked: !!reason, reason: reason ?? undefined, images };
    listeners.forEach((l) => l(ev));
    if (reason) throw new GuardBlocked(reason);
    return orig(input, init);
  };
}
