// Client-side budget for cloud calls. The project's free tier is shared by every visitor
// (15 requests/min, 500/day), so each browser keeps well inside it.
const KEY = 'tickmark.cloudCalls';
const PER_MINUTE = 6;
const PER_DAY = 40;

function load(): number[] {
  try { return (JSON.parse(localStorage.getItem(KEY) ?? '[]') as number[]).filter((t) => Date.now() - t < 86_400_000); } catch { return []; }
}
function save(ts: number[]) { try { localStorage.setItem(KEY, JSON.stringify(ts)); } catch { /* private mode */ } }

let memory: number[] = [];
const all = () => { const s = load(); return s.length ? s : memory; };

export function canCallCloud(now = Date.now()): boolean {
  const ts = all();
  return ts.filter((t) => now - t < 60_000).length < PER_MINUTE && ts.length < PER_DAY;
}

export function noteCloudCall(now = Date.now()) {
  const ts = [...all(), now];
  memory = ts;
  save(ts);
}
