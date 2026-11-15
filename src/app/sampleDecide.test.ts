import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { markAnswer, type QuestionKey } from '../marking/mark';
import { needsCheck } from '../marking/pipeline';
import { decideFromKey } from './sampleDecide';

const man = JSON.parse(readFileSync('public/samples/english/manifest.json', 'utf8'));
const keys: QuestionKey[] = man.quiz.questions.map((q: { q: number; prompt: string; key: string; spellingCounts?: boolean }) => ({ q: q.q, prompt: q.prompt, answer: q.key, ...(q.spellingCounts ? { spellingCounts: true } : {}) }));
// a reading with a few slips: every third answer misread, open answers pending
const sheets = man.students.slice(0, 6).map((s: { id: string; answers: { q: number; written: string }[] }, i: number) => ({
  id: `sheet-${i}`, quizId: 'q', source: 'sample' as const, sampleId: s.id, status: 'read' as const, createdAt: i,
  marks: keys.map((k, j) => markAnswer(k, j % 3 === 0 ? 'zzz' : s.answers.find((a) => a.q === k.q)!.written)),
}));

describe('round 5 J5: decide a made-up class from its answer key', () => {
  it('decides every waiting mark and confirms every name', () => {
    const out = decideFromKey({ id: 'c', name: 'English 8C', roster: [], createdAt: 0, sample: true }, keys, sheets, man.students);
    expect(out.flatMap((s) => s.marks).filter(needsCheck)).toEqual([]);
    expect(out.every((s) => s.nameConfident && s.studentId === s.sampleId)).toBe(true);
    expect(out.flatMap((s) => s.marks).some((m) => m.decidedBy === 'sample_key')).toBe(true);
  });
  it('refuses a real class', () => {
    expect(() => decideFromKey({ id: 'c', name: '7B', roster: [], createdAt: 0 }, keys, sheets, man.students)).toThrow(/made-up/);
  });
});
