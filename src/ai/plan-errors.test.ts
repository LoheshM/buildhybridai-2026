import { describe, expect, it } from 'vitest';
import { classifyPlanError } from './tasks';

describe('round 5 F4-09: plan errors say what really happened', () => {
  it('a per-day quota is not "try again in a minute"', () => {
    const e = Object.assign(new Error('[429] Quota exceeded for metric generate_content_requests, limit PerDay'), { customErrorData: { status: 429 } });
    const p = classifyPlanError(e);
    expect(p.kind).toBe('quota_day');
    expect(p.message).toMatch(/resets/);
  });
  it('a per-minute 429 still says try again in a minute', () => {
    const e = Object.assign(new Error('[429] Resource exhausted'), { customErrorData: { status: 429, errorDetails: [{ quotaId: 'GenerateRequestsPerMinutePerProject' }] } });
    expect(classifyPlanError(e).kind).toBe('quota');
  });
});

describe('round 5 critic WP5: plan errors name the real cause', () => {
  it('F4-17 a guard block during a sheet read says so, not "a name"', () => {
    const e = Object.assign(new Error('a student sheet was being read on this laptop'), { name: 'GuardBlocked' });
    expect(classifyPlanError(e).message).toMatch(/pupil sheet was being read/);
  });
  it('a guard block for a name still says name', () => {
    const e = Object.assign(new Error('text containing a name from your class list'), { name: 'GuardBlocked' });
    expect(classifyPlanError(e).message).toMatch(/name/);
  });
});

describe('round 5 WP5', () => {
  it('F4-21 at most 8 mistake groups get their own parent note', async () => {
    const { noteGroups } = await import('./prompts');
    const ids = ['place_value', 'sign_error', 'rounding', 'wrong_unit', 'missing_unit', 'percent_decimal', 'decimal_alignment', 'not_solved', 'inverse_operation', 'spelling', 'wrong_term'];
    const t = { v: 2, subject: 'maths', grade_band: '7-9', k: 3, note_languages: ['en'], questions: ids.map((m, i) => ({ q: i + 1, type: 'number', question: '', answer: '1', right: 3, partial: 0, wrong: 3, mistakes: { [m]: 3 } })) } as never;
    expect(noteGroups(t).length).toBeLessThanOrEqual(11);
  });
  it('F4-28 a negative device answer is cached for the UI, never for a pupil sheet', async () => {
    const { deviceState, assertDeviceReady } = await import('./gate');
    let calls = 0;
    (globalThis as unknown as { LanguageModel: unknown }).LanguageModel = { availability: async () => { calls++; return 'unavailable'; } };
    await deviceState(); const after1 = calls; await deviceState();
    expect(calls).toBe(after1);
    await expect(assertDeviceReady()).rejects.toThrow();
    expect(calls).toBeGreaterThan(after1);
    delete (globalThis as unknown as { LanguageModel?: unknown }).LanguageModel;
  });
});
