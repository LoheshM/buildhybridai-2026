// One GenerativeModel per (task, mode): on-device prompt options and schemas are fixed when a
// model is created, so each task gets its own instance.
import { getGenerativeModel, InferenceMode, type GenerativeModel } from 'firebase/ai';
import { DEVICE_EXPECTED_INPUTS, DEVICE_EXPECTED_OUTPUTS } from '../config';
import { aiInstance, currentSettings } from './firebase';
import { REREAD_SCHEMA, SHEET_SCHEMA, TOTALS_SCHEMA_CLOUD, TOTALS_SCHEMA_DEVICE } from './schemas';

export type Task = 'readSheet' | 'reread' | 'warmup' | 'classTotals';
export type Mode = (typeof InferenceMode)[keyof typeof InferenceMode];

const SCHEMAS: Record<Task, { device?: object; cloud?: object }> = {
  readSheet: { device: SHEET_SCHEMA, cloud: SHEET_SCHEMA },
  reread: { device: REREAD_SCHEMA, cloud: REREAD_SCHEMA },
  warmup: {},
  classTotals: { device: TOTALS_SCHEMA_DEVICE, cloud: TOTALS_SCHEMA_CLOUD },
};

const cache = new Map<string, GenerativeModel>();

export function model(task: Task, mode: Mode): GenerativeModel {
  const cloudModel = currentSettings().cloudModel;
  const key = `${task}|${mode}|${cloudModel}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = SCHEMAS[task];
  const m = getGenerativeModel(aiInstance(), {
    mode,
    onDeviceParams: {
      createOptions: { expectedInputs: [...DEVICE_EXPECTED_INPUTS] as never, expectedOutputs: [...DEVICE_EXPECTED_OUTPUTS] as never },
      ...(s.device ? { promptOptions: { responseConstraint: s.device as never } } : {}),
    },
    inCloudParams: {
      model: cloudModel,
      generationConfig: {
        temperature: task === 'classTotals' ? 0.6 : 0,
        ...(s.cloud ? ({ responseMimeType: 'application/json', responseJsonSchema: s.cloud } as object) : {}),
      },
    },
  });
  cache.set(key, m);
  return m;
}

export { InferenceMode };
