// One GenerativeModel per (task, mode, schema): on-device prompt options and schemas are fixed
// when a model is created, so each task and response shape gets its own instance.
import { getGenerativeModel, InferenceMode, type GenerativeModel } from 'firebase/ai';
import { DEVICE_EXPECTED_INPUTS, DEVICE_EXPECTED_OUTPUTS } from '../config';
import { aiInstance, currentSettings, deviceOnlyAi } from './firebase';
import { REREAD_SCHEMA, TOTALS_SCHEMA_CLOUD, TOTALS_SCHEMA_DEVICE } from './schemas';

export type Task = 'readSheet' | 'reread' | 'warmup' | 'classTotals' | 'suggest';
export type Mode = (typeof InferenceMode)[keyof typeof InferenceMode];

/** Fixed schemas; tasks whose shape depends on the quiz pass their own. */
const FIXED: Partial<Record<Task, { device?: object; cloud?: object }>> = {
  reread: { device: REREAD_SCHEMA, cloud: REREAD_SCHEMA },
  warmup: {},
  classTotals: { device: TOTALS_SCHEMA_DEVICE, cloud: TOTALS_SCHEMA_CLOUD },
};

const cache = new Map<string, { m: GenerativeModel; abort: AbortController }>();
const keyOf = (task: Task, mode: Mode, schema?: object) =>
  `${task}|${mode}|${mode === InferenceMode.ONLY_ON_DEVICE ? '' : currentSettings().cloudModel}|${schema ? JSON.stringify(schema) : ''}`;

export function model(task: Task, mode: Mode, schema?: object): GenerativeModel {
  const key = keyOf(task, mode, schema);
  const hit = cache.get(key);
  if (hit) return hit.m;
  const s = schema ? { device: schema, cloud: schema } : (FIXED[task] ?? {});
  // Each instance gets its own AbortSignal in the on-device prompt options, so a hung prompt can be
  // cancelled (resetModel) instead of blocking every later on-device call on the page.
  const abort = new AbortController();
  const m = getGenerativeModel(mode === InferenceMode.ONLY_ON_DEVICE ? deviceOnlyAi() : aiInstance(), {
    mode,
    onDeviceParams: {
      createOptions: { expectedInputs: [...DEVICE_EXPECTED_INPUTS] as never, expectedOutputs: [...DEVICE_EXPECTED_OUTPUTS] as never },
      promptOptions: { ...(s.device ? { responseConstraint: s.device as never } : {}), signal: abort.signal } as never,
    },
    inCloudParams: {
      model: currentSettings().cloudModel,
      generationConfig: {
        temperature: task === 'classTotals' ? 0.6 : 0,
        ...(s.cloud ? ({ responseMimeType: 'application/json', responseJsonSchema: s.cloud } as object) : {}),
      },
    },
  });
  cache.set(key, { m, abort });
  // keep the cache small: quizzes with many shapes would otherwise pile up sessions
  if (cache.size > 24) { const [oldKey, old] = cache.entries().next().value!; try { old.abort.abort(new DOMException('Evicted', 'AbortError')); } catch { /* ignore */ } cache.delete(oldKey); }
  return m;
}

/** Cancels a hung on-device prompt and drops the instance so the next call starts a fresh session. */
export function resetModel(task: Task, mode: Mode) {
  // every cached instance for this task and mode, whatever cloud model or schema it was made with
  for (const [key, hit] of [...cache]) {
    if (!key.startsWith(`${task}|${mode}|`)) continue;
    try { hit.abort.abort(new DOMException('Timed out', 'TimeoutError')); } catch { /* ignore */ }
    cache.delete(key);
  }
}

/** Cancels every prompt in flight (Stop). */
export function resetAllModels() {
  for (const hit of cache.values()) { try { hit.abort.abort(new DOMException('Stopped', 'AbortError')); } catch { /* ignore */ } }
  cache.clear();
}

export { InferenceMode };
