// The record of every AI call and every request that left (or tried to leave) the browser.
// The Outbox and the header counter are built from this, so they show what really happened.
import { onOutbound, type OutboundEvent } from './netGuard';

export type DataClass = 'student' | 'sample' | 'totals' | 'system';
export type Where = 'on_device' | 'in_cloud' | 'recorded' | 'local' | 'blocked';

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
const newId = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

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

export interface Counters { cloudRequests: number; bytesSent: number; blocked: number; studentPhotosSent: number; onDeviceCalls: number }

/** Header counters. "Student photos sent" counts sent requests carrying a non-sample image: the guard makes this impossible, so it stays 0. */
export function counters(evts: LedgerEvent[] = events): Counters {
  const c: Counters = { cloudRequests: 0, bytesSent: 0, blocked: 0, studentPhotosSent: 0, onDeviceCalls: 0 };
  for (const e of evts) {
    if (e.kind === 'net') {
      if (e.blocked) c.blocked++;
      else { c.cloudRequests++; c.bytesSent += e.bytes; }
    } else if (e.where === 'on_device') c.onDeviceCalls++;
  }
  return c;
}
