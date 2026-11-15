// Pre-call gate for student work: the on-device model must be present and ready, otherwise
// we refuse before the SDK is ever called (the SDK would silently use the cloud).
import { DEVICE_EXPECTED_INPUTS, DEVICE_EXPECTED_OUTPUTS } from '../config';

export type DeviceState = 'unsupported' | 'unavailable' | 'no_image' | 'downloadable' | 'downloading' | 'available' | 'not_responding';

interface LanguageModelStatic {
  availability(opts?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
}
const lm = (): LanguageModelStatic | undefined => (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;

export const AVAILABILITY_OPTIONS = { expectedInputs: DEVICE_EXPECTED_INPUTS, expectedOutputs: DEVICE_EXPECTED_OUTPUTS };
const TEXT_ONLY = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: DEVICE_EXPECTED_OUTPUTS };

/** availability() itself can hang when Chrome's model service is stuck; never wait on it for long. */
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | 'timeout'> =>
  Promise.race([p, new Promise<'timeout'>((r) => setTimeout(() => r('timeout'), ms))]);

let negative: { s: DeviceState; at: number } | null = null;
const NEGATIVE: DeviceState[] = ['unsupported', 'unavailable', 'no_image'];
/** fresh: skip the 30-second cache of a negative answer (pupils' sheets always check afresh). */
export async function deviceState(o: { fresh?: boolean } = {}): Promise<DeviceState> {
  if (!o.fresh && negative && Date.now() - negative.at < 30_000) return negative.s;
  const s = await probeDevice();
  negative = NEGATIVE.includes(s) ? { s, at: Date.now() } : null;
  return s;
}

async function probeDevice(): Promise<DeviceState> {
  const api = lm();
  if (!api || typeof api.availability !== 'function') return 'unsupported';
  try {
    const s = await withTimeout(api.availability(AVAILABILITY_OPTIONS), 8000);
    if (s === 'timeout') return 'not_responding';
    if (s !== 'unavailable') return s;
    // Text works but images don't: the multimodal flag is off on this Chrome.
    try { if ((await api.availability(TEXT_ONLY)) !== 'unavailable') return 'no_image'; } catch { /* ignore */ }
    return 'unavailable';
  } catch { return 'unavailable'; }
}

export class DeviceUnavailable extends Error {
  state: DeviceState;
  constructor(state: DeviceState) {
    super(DEVICE_STATE_TEXT[state].title + '.');
    this.name = 'DeviceUnavailable';
    this.state = state;
  }
}

export async function assertDeviceReady(): Promise<void> {
  const s = await deviceState({ fresh: true });
  if (s !== 'available') throw new DeviceUnavailable(s);
}

export const DEVICE_STATE_TEXT: Record<DeviceState, { title: string; body: string }> = {
  available: { title: 'On-device AI ready', body: 'Worksheets are read by Gemini Nano on this laptop. Nothing is uploaded.' },
  downloadable: { title: 'On-device AI not downloaded yet', body: 'Chrome can download Gemini Nano once: a few GB, about 5 minutes. You can try the sample class meanwhile.' },
  downloading: { title: 'Downloading Gemini Nano', body: 'You can try the sample class meanwhile; it uses recorded readings until the download finishes.' },
  no_image: { title: 'Image reading is switched off in this Chrome', body: 'Open chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, set it to Enabled and restart Chrome. Until then, the sample class still works, and you can type answers in for your own class.' },
  unavailable: { title: "Gemini Nano can't run on this laptop", body: 'It needs Chrome on a laptop with 16 GB of memory (or a graphics card with more than 4 GB) and 22 GB of free disk. The sample class still works, and you can type answers in for your own class; marking happens here.' },
  not_responding: { title: 'The on-device model stopped responding', body: 'Reload the page (Ctrl+R) to restart it. Sheets read so far are saved; click Read the rest afterwards.' },
  unsupported: { title: 'This browser has no on-device AI', body: 'On-device reading needs a recent desktop Chrome on a laptop that can run Gemini Nano. The sample class still works here, and you can type answers in for your own class; marking happens on this laptop.' },
};
