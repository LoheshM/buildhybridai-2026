// One queue for every on-device call. The SDK destroys the previous Chrome session when a new
// one is created, so overlapping on-device prompts would abort each other.

export class TimeoutError extends Error { constructor(ms: number, what = 'the on-device model') { super(`No answer from ${what} after ${Math.round(ms / 1000)} s`); this.name = 'TimeoutError'; } }
export class CancelledError extends Error { constructor() { super('Cancelled'); this.name = 'CancelledError'; } }

let tail: Promise<unknown> = Promise.resolve();
let generation = 0;
let pending = 0;

export const queueLength = () => pending;

/** Cancels everything queued but not yet started (the running call finishes or times out). */
export function cancelQueued() { generation++; }

export function enqueue<T>(fn: () => Promise<T>, timeoutMs: number, what?: string): Promise<T> {
  const gen = generation;
  pending++;
  const run = async () => {
    if (gen !== generation) throw new CancelledError();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new TimeoutError(timeoutMs, what)), timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); }
  };
  const p = tail.then(run, run);
  tail = p.catch(() => undefined).finally(() => { pending--; });
  return p;
}
