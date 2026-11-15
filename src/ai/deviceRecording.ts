// Gemini Nano's own output on the made-up sample sheets, recorded on the author's laptop and replayed,
// labelled "Gemini Nano · recorded", in browsers that have no on-device model. Only Nano's raw output is
// kept (the reading and the suggested mark as the model gave them); the marking code runs again on it
// today, so engine fixes apply to the replay too. Pupils' sheets are never recorded or replayed: a
// recording is found only by the id of a fingerprint-verified sample photo.
import type { RawSuggestion, SheetRead } from './schemas';
import type { SecondRead } from './tasks';

export interface DeviceRecording {
  recordedAt: string;
  model: string;
  chrome: string;
  promptsVersion: string;
  reads: Record<string, { first: SheetRead; firstMs: number; second?: Record<string, SecondRead>; secondMs?: number }>;
  /** "<sample id>:<question>" */
  suggestions: Record<string, { raw: RawSuggestion; ms: number }>;
  missing?: string[];
}

const recordings = new Map<string, DeviceRecording>();
export const setDeviceRecording = (cls: string, r: DeviceRecording) => { recordings.set(cls, r); };
export const deviceRecordingInfo = (cls: string) => recordings.get(cls) ?? null;
/** "2026-11-15T…" → "15 Nov 2026" */
export const dayOf = (iso: string) => { const d = new Date(iso); return Number.isNaN(+d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
export const deviceReadFor = (sampleId: string) => {
  for (const r of recordings.values()) if (r.reads[sampleId]) return { rec: r, read: r.reads[sampleId] };
  return null;
};
export const deviceSuggestionFor = (sampleId: string, q: number) => {
  for (const r of recordings.values()) { const s = r.suggestions[`${sampleId}:${q}`]; if (s) return { rec: r, s }; }
  return null;
};

/**
 * Development only, and only with ?record in the address: collects Nano's raw output for sample sheets
 * while tools/bench2.py reads the sample classes. Never active in a deployed build.
 */
const RECORDING = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('record');
type Capture = Omit<DeviceRecording, 'recordedAt' | 'model' | 'chrome' | 'promptsVersion' | 'missing'>;
export const capture: Capture | null = RECORDING ? { reads: {}, suggestions: {} } : null;
if (capture) (globalThis as unknown as { __tickmarkCapture: Capture }).__tickmarkCapture = capture;
