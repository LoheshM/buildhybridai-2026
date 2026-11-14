import { describe, expect, it, beforeEach } from 'vitest';
import { assertDeviceReady, deviceState } from './gate';
import { inspectBody, setAllowedImageHashes, setRosterTokens, sha256Hex, withStudentLock } from './netGuard';
import { rosterTokens } from '../privacy/nameCheck';
import { clampSettings } from './firebase';

const g = globalThis as unknown as { LanguageModel?: unknown };

describe('device gate (the SDK would silently use the cloud without it)', () => {
  beforeEach(() => { delete g.LanguageModel; });
  it('no LanguageModel API means unsupported, and the gate throws', async () => {
    expect(await deviceState()).toBe('unsupported');
    await expect(assertDeviceReady()).rejects.toThrow(/no on-device AI/);
  });
  it.each(['downloadable', 'downloading', 'unavailable'])('%s is refused', async (s) => {
    g.LanguageModel = { availability: async () => s };
    await expect(assertDeviceReady()).rejects.toThrow(new RegExp(s));
  });
  it('available passes', async () => {
    g.LanguageModel = { availability: async () => 'available' };
    await expect(assertDeviceReady()).resolves.toBeUndefined();
  });
  it('a throwing availability() counts as unavailable', async () => {
    g.LanguageModel = { availability: async () => { throw new Error('NotSupportedError'); } };
    expect(await deviceState()).toBe('unavailable');
  });
});

describe('network guard', () => {
  const sampleBytes = new TextEncoder().encode('pretend this is sample sheet s01');
  const otherBytes = new TextEncoder().encode('a photo of a real student sheet');
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
  const body = (parts: object[]) => JSON.stringify({ contents: [{ role: 'user', parts }] });

  beforeEach(async () => {
    setAllowedImageHashes([await sha256Hex(sampleBytes)]);
    setRosterTokens(rosterTokens(['Meera Krishnan', 'Aarav Shah']));
  });

  it('lets class totals and sample images through', async () => {
    expect((await inspectBody(body([{ text: 'Class totals: {"q":2,"wrong":9}' }]))).reason).toBeNull();
    expect((await inspectBody(body([{ text: 'Read this' }, { inlineData: { mimeType: 'image/jpeg', data: b64(sampleBytes) } }]))).reason).toBeNull();
  });
  it('blocks any image that is not a sample sheet', async () => {
    const r = await inspectBody(body([{ text: 'Read this' }, { inlineData: { mimeType: 'image/jpeg', data: b64(otherBytes) } }]));
    expect(r.reason).toMatch(/not a Tickmark sample/);
  });
  it('blocks a sample image changed by one byte', async () => {
    const tampered = sampleBytes.slice(); tampered[0] ^= 1;
    expect((await inspectBody(body([{ inlineData: { mimeType: 'image/jpeg', data: b64(tampered) } }]))).reason).toMatch(/not a Tickmark sample/);
  });
  it('blocks text containing a roster name, in any case', async () => {
    expect((await inspectBody(body([{ text: 'Help MEERA with fractions' }]))).reason).toMatch(/name from your class list/);
    expect((await inspectBody(JSON.stringify({ contents: [], systemInstruction: { parts: [{ text: 'student aarav' }] } }))).reason).toMatch(/name/);
  });
  it('blocks everything while a student sheet is being read', async () => {
    await withStudentLock(async () => {
      expect((await inspectBody(body([{ text: 'Class totals' }]))).reason).toMatch(/student sheet/);
    });
    expect((await inspectBody(body([{ text: 'Class totals' }]))).reason).toBeNull();
  });
  it('blocks bodies it cannot read', async () => {
    expect((await inspectBody('not json')).reason).toMatch(/unreadable/);
  });
});

describe('Remote Config can only tighten', () => {
  it('clamps values', () => {
    expect(clampSettings({ cloud_model: 'gemini-9-ultra', min_group_size: 1, sample_cloud_live_reads: 50 }, 'remote')).toMatchObject({ cloudModel: 'gemini-3.5-flash-lite', minGroupSize: 3, sampleLiveReads: 3 });
    expect(clampSettings({ cloud_model: 'gemini-3.1-flash-lite', min_group_size: 5, sample_cloud_live_reads: 0, cloud_features_enabled: false }, 'remote')).toMatchObject({ cloudModel: 'gemini-3.1-flash-lite', minGroupSize: 5, sampleLiveReads: 0, cloudFeaturesEnabled: false });
  });
});
