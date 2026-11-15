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
