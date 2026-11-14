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
const setDevice = (p: Partial<Device>) => { device = { ...device, ...p }; subs.forEach((s) => s()); };
const subscribe = (s: () => void) => { subs.add(s); return () => { subs.delete(s); }; };

export async function refreshDevice() {
  const s = await deviceState();
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
  setDevice({ error: null, progress: 0, state: 'downloading' });
  try {
    await initDeviceModel((p) => setDevice({ progress: p }));
    setDevice({ progress: 1 });
    const s = await refreshDevice();
    if (s === 'available') await warm();
  } catch (e) {
    setDevice({ error: (e as Error).message, progress: null });
    await refreshDevice();
  }
}

export function useDevice() {
  const d = useSyncExternalStore(subscribe, () => device, () => device);
  useEffect(() => {
    let alive = true;
    refreshDevice().then((s) => { if (alive && s === 'available') warm(); });
    const t = setInterval(() => { if (device.state === 'downloading' && device.progress === null) refreshDevice(); }, 4000);
    return () => { alive = false; clearInterval(t); };
  }, []);
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
