// Pre-call gate for student work: the on-device model must be present and ready, otherwise
// we refuse before the SDK is ever called (the SDK would silently use the cloud).
import { DEVICE_EXPECTED_INPUTS, DEVICE_EXPECTED_OUTPUTS } from '../config';

export type DeviceState = 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelStatic {
  availability(opts?: unknown): Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
}
const lm = (): LanguageModelStatic | undefined => (globalThis as unknown as { LanguageModel?: LanguageModelStatic }).LanguageModel;

export const AVAILABILITY_OPTIONS = { expectedInputs: DEVICE_EXPECTED_INPUTS, expectedOutputs: DEVICE_EXPECTED_OUTPUTS };

export async function deviceState(): Promise<DeviceState> {
  const api = lm();
  if (!api || typeof api.availability !== 'function') return 'unsupported';
  try { return await api.availability(AVAILABILITY_OPTIONS); } catch { return 'unavailable'; }
}

export class DeviceUnavailable extends Error {
  state: DeviceState;
  constructor(state: DeviceState) {
    super(state === 'unsupported' ? 'This browser has no on-device AI.' : `The on-device model is ${state}.`);
    this.name = 'DeviceUnavailable';
    this.state = state;
  }
}

export async function assertDeviceReady(): Promise<void> {
  const s = await deviceState();
  if (s !== 'available') throw new DeviceUnavailable(s);
}

export const DEVICE_STATE_TEXT: Record<DeviceState, { title: string; body: string }> = {
  available: { title: 'On-device AI ready', body: 'Worksheets are read on this laptop. Nothing is uploaded.' },
  downloadable: { title: 'On-device AI not downloaded yet', body: 'Chrome can download Gemini Nano (a one-time download of a few GB, about 5 minutes).' },
  downloading: { title: 'Downloading on-device AI…', body: 'You can try the sample class while it downloads.' },
  unavailable: { title: "This laptop can't run on-device AI", body: 'Gemini Nano needs Chrome on a laptop with 16 GB RAM or a GPU with more than 4 GB, and 22 GB free disk. You can still type answers in; marking runs on this laptop.' },
  unsupported: { title: 'This browser has no on-device AI', body: 'Use Chrome 139 or newer on Windows, macOS or Linux. You can still type answers in; marking runs on this laptop.' },
};
