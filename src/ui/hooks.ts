import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { deviceState, type DeviceState } from '../ai/gate';
import { counters, ledger } from '../ai/ledger';
import { initDeviceModel, warmUp } from '../ai/tasks';

// ---------- ledger ----------
export function useLedger() {
  return useSyncExternalStore(ledger.subscribe, ledger.all, ledger.all);
}
export function useCounters() { return counters(useLedger()); }

// ---------- device model (shared across the app) ----------
interface Device { state: DeviceState | 'checking'; progress: number | null; warming: boolean; warmMs: number | null; error: string | null }
let device: Device = { state: 'checking', progress: null, warming: false, warmMs: null, error: null };
const subs = new Set<() => void>();
let downloadPending = false;
const setDevice = (p: Partial<Device>) => {
  const before = device.state;
  device = { ...device, ...p };
  subs.forEach((s) => s());
  if (before !== 'available' && device.state === 'available') warm(); // warm on every arrival at "available"
};
const subscribe = (s: () => void) => { subs.add(s); return () => { subs.delete(s); }; };

export async function refreshDevice() {
  const s = await deviceState();
  // While our own download is running Chrome may still answer "downloadable"; keep showing progress.
  if (downloadPending && s === 'downloadable') return device.state as DeviceState;
  setDevice({ state: s });
  return s;
}

let warmed = false;
async function warm() {
  if (warmed || device.warming) return;
  setDevice({ warming: true });
  try { const ms = await warmUp(); warmed = true; setDevice({ warmMs: ms }); }
  catch (e) { setDevice({ error: (e as Error).message }); }
  finally { setDevice({ warming: false }); }
}

/** Must be called from a click handler: Chrome only downloads Gemini Nano after a user gesture. */
export async function downloadDeviceModel() {
  downloadPending = true;
  setDevice({ error: null, progress: 0, state: 'downloading' });
  try {
    await initDeviceModel((p) => setDevice({ progress: p }));
    setDevice({ progress: 1 });
  } catch (e) {
    setDevice({ error: `The download didn't finish: ${(e as Error).message}. Click Download to try again.`, progress: null });
  } finally {
    downloadPending = false;
    await refreshDevice();
  }
}

let poller: ReturnType<typeof setInterval> | null = null;
function ensurePolling() {
  if (poller) return;
  poller = setInterval(() => { if (device.state === 'downloading' || device.state === 'checking') refreshDevice(); }, 4000);
}

export function useDevice() {
  const d = useSyncExternalStore(subscribe, () => device, () => device);
  useEffect(() => { refreshDevice(); ensurePolling(); }, []);
  return d;
}

// ---------- async loading ----------
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]): [T | undefined, () => void] {
  const [v, setV] = useState<T>();
  const [n, setN] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const f = useCallback(fn, deps);
  useEffect(() => { let alive = true; f().then((x) => alive && setV(x)); return () => { alive = false; }; }, [f, n]);
  return [v, () => setN((x) => x + 1)];
}

export function useToast(): [string | null, (m: string) => void] {
  const [m, setM] = useState<string | null>(null);
  useEffect(() => { if (!m) return; const t = setTimeout(() => setM(null), 2600); return () => clearTimeout(t); }, [m]);
  return [m, setM];
}
