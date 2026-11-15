// The record of every AI call and every request that left (or tried to leave) the browser.
// The Outbox and the header counter are built from this, so they show what really happened.
import { onOutbound, type OutboundEvent } from './netGuard';

export type DataClass = 'student' | 'sample' | 'totals' | 'system';
/** recorded_device: Gemini Nano's own output, recorded on the author's laptop (sample sheets only). recorded: cloud Gemini's. */
export type Where = 'on_device' | 'in_cloud' | 'recorded' | 'recorded_device' | 'local' | 'blocked';

export interface CallEvent {
  kind: 'call';
  id: string;
  at: number;
  task: string; // e.g. "Read sheet", "Second read", "Reteach plan"
  dataClass: DataClass;
  mode: string; // requested inference mode
  where: Where;
  ms: number;
  ok: boolean;
  note?: string;
}

export interface NetEvent extends OutboundEvent { kind: 'net'; id: string }
export type LedgerEvent = CallEvent | NetEvent;

type Listener = () => void;
let events: LedgerEvent[] = [];
const listeners = new Set<Listener>();
let persist: ((e: LedgerEvent) => void) | null = null;
let seq = 0;
const newId = () => (typeof globalThis.crypto?.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${(seq++).toString(36)}`);

export const ledger = {
  all: () => events,
  subscribe(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  setPersist(fn: (e: LedgerEvent) => void) { persist = fn; },
  load(saved: LedgerEvent[]) { events = [...saved].sort((a, b) => a.at - b.at); emit(); },
  clear() { events = []; emit(); },
  addCall(e: Omit<CallEvent, 'kind' | 'id' | 'at'>) {
    const ev: CallEvent = { kind: 'call', id: newId(), at: Date.now(), ...e };
    push(ev);
    return ev;
  },
};

function push(e: LedgerEvent) { events = [...events, e]; persist?.(e); emit(); }
function emit() { listeners.forEach((l) => l()); }

onOutbound((e) => push({ kind: 'net', id: newId(), ...e }));

export interface Counters { cloudRequests: number; bytesSent: number; blocked: number; studentPhotosSent: number; studentPhotosBlocked: number; onDeviceCalls: number }

/** Header counters, measured from the requests the guard saw. A sent request with a non-sample image would count as a student photo sent. */
export function counters(evts: LedgerEvent[] = events): Counters {
  const c: Counters = { cloudRequests: 0, bytesSent: 0, blocked: 0, studentPhotosSent: 0, studentPhotosBlocked: 0, onDeviceCalls: 0 };
  for (const e of evts) {
    if (e.kind === 'net') {
      if (e.blocked) { c.blocked++; c.studentPhotosBlocked += e.nonSampleImages ?? 0; }
      else { c.cloudRequests++; c.bytesSent += e.bytes; c.studentPhotosSent += e.nonSampleImages ?? 0; }
    } else if (e.where === 'on_device') c.onDeviceCalls++;
  }
  return c;
}
