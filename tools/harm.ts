// Marking harm of each read variant in probe/results.jsonl: an answer whose MARK from the model's
// reading differs from the mark of what the pupil really wrote, with no flag raised for the teacher.
// Usage: npx -y tsx tools/harm.ts
import { readFileSync } from 'node:fs';
import { markAnswer, type QuestionKey } from '../src/marking/mark';
import { isOpen } from '../src/marking/qtypes';
import { typeOf } from '../src/marking/mark';
import { needsCheck } from '../src/marking/pipeline';

const R = new Map<string, { ok: boolean; text: string }>();
for (const l of readFileSync('../probe/results.jsonl', 'utf8').split('\n')) if (l.trim()) { const o = JSON.parse(l); R.set(o.key, o); }
const variants = process.argv.slice(2).length ? process.argv.slice(2) : ['A', 'B', 'C', 'D', 'E'];
for (const v of variants) {
  for (const cls of ['science', 'english', 'maths']) {
    const m = JSON.parse(readFileSync(`public/samples/${cls}/manifest.json`, 'utf8'));
    const keys: QuestionKey[] = m.quiz.questions.map((q: { q: number; prompt: string; key: string; spellingCounts?: boolean }) => ({ q: q.q, prompt: q.prompt, answer: q.key, ...(q.spellingCounts ? { spellingCounts: true } : {}) }));
    let n = 0, harm = 0, flaggedHarm = 0, flags = 0;
    const ex: string[] = [];
    for (const s of m.students) {
      const o = R.get(`rv|${v}|${s.id}`);
      if (!o?.ok) continue;
      const g = JSON.parse(o.text);
      for (const a of s.answers) {
        const k = keys[a.q - 1];
        if (isOpen(typeOf(k))) continue;
        const read = (g[`q${a.q}`] ?? {}).answer ?? '';
        const got = markAnswer(k, read), want = markAnswer(k, a.written);
        n++;
        const flagged = needsCheck(got);
        if (flagged) flags++;
        if (got.status !== want.status) { if (flagged) flaggedHarm++; else { harm++; if (ex.length < 5) ex.push(`${s.id} q${a.q} wrote "${a.written}" read "${read}" → ${got.status} (should be ${want.status})`); } }
      }
    }
    if (n) console.log(`${v} ${cls}: ${n} exact answers, flagged ${flags} (${(100 * flags / n).toFixed(0)}%), wrong mark caught by a flag ${flaggedHarm}, WRONG MARK UNFLAGGED ${harm} (${(100 * harm / n).toFixed(1)}%)${ex.length ? '\n   ' + ex.join('\n   ') : ''}`);
  }
}
