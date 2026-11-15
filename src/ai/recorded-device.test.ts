// Round 5 (J2): the recorded Gemini Nano run that browsers without Nano replay. It must be complete, made with
// the prompts that ship, and hold nothing but Nano's raw output for made-up sample sheets.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROMPTS_VERSION } from './prompts';

for (const cls of ['maths', 'science', 'english']) {
  const path = `public/samples/${cls}/recorded-device.json`;
  describe.skipIf(!existsSync(path))(`recorded Gemini Nano run: ${cls}`, () => {
    const rec = JSON.parse(readFileSync(path, 'utf8'));
    const man = JSON.parse(readFileSync(`public/samples/${cls}/manifest.json`, 'utf8'));
    const ids: string[] = man.students.map((s: { id: string }) => s.id);
    it('only the allowed fields', () => {
      expect(Object.keys(rec).sort()).toEqual(['chrome', 'missing', 'model', 'promptsVersion', 'reads', 'recordedAt', 'suggestions'].sort());
      for (const r of Object.values(rec.reads) as Record<string, unknown>[]) for (const k of Object.keys(r)) expect(['first', 'firstMs', 'second', 'secondMs']).toContain(k);
      for (const s of Object.values(rec.suggestions) as Record<string, unknown>[]) expect(Object.keys(s).sort()).toEqual(['ms', 'raw']);
    });
    it('made with the prompts that ship', () => { expect(rec.promptsVersion).toBe(PROMPTS_VERSION); });
    it('every made-up sheet is recorded (at most one left out)', () => {
      for (const id of Object.keys(rec.reads)) expect(ids).toContain(id);
      for (const id of ids) expect(rec.reads[id]?.firstMs > 0 || rec.missing.includes(id), id).toBe(true);
      expect(rec.missing.length).toBeLessThanOrEqual(1);
    });
    it('suggestions only for sample sheets', () => {
      for (const k of Object.keys(rec.suggestions)) expect(ids).toContain(k.split(':')[0]);
    });
  });
}
