// Builds the synthetic "Class 6B" sample: 28 fictional students answering a 10-question
// fractions check, with known misconceptions injected. Output: tools/samples/out/manifest.json
// (ground truth used by the live regression and by the sheet renderer).
// Every student is fictional; names are generated from common first names, not real pupils.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// --- tiny independent rational helper (deliberately separate from src/marking) ---
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const R = (n, d) => ({ n, d });
const add = (x, y) => R(x.n * y.d + y.n * x.d, x.d * y.d);
const sub = (x, y) => R(x.n * y.d - y.n * x.d, x.d * y.d);
const mul = (x, y) => R(x.n * y.n, x.d * y.d);
const div = (x, y) => R(x.n * y.d, x.d * y.n);
const simp = (x) => { const g = gcd(x.n, x.d) || 1; return R(x.n / g, x.d / g); };
const fmt = (x, mixed = false) => {
  x = simp(x);
  if (x.d === 1) return String(x.n);
  if (mixed && Math.abs(x.n) > x.d) { const w = Math.trunc(x.n / x.d); return `${w} ${Math.abs(x.n % x.d)}/${x.d}`; }
  return `${x.n}/${x.d}`;
};
const raw = (x) => (x.d === 1 ? String(x.n) : `${x.n}/${x.d}`);

// --- quiz ---
export const QUIZ = {
  title: 'Fractions Check',
  className: 'Class 6B',
  questions: [
    { q: 1, op: '+', a: [0, 1, 2], b: [0, 1, 4] },
    { q: 2, op: '+', a: [0, 2, 3], b: [0, 1, 6] },
    { q: 3, op: '-', a: [0, 3, 5], b: [0, 1, 10] },
    { q: 4, op: '-', a: [0, 3, 4], b: [0, 1, 3] },
    { q: 5, op: '+', a: [0, 2, 5], b: [0, 1, 3] },
    { q: 6, op: 'x', a: [0, 1, 3], b: [0, 3, 4] },
    { q: 7, op: 'x', a: [0, 2, 3], b: [0, 3, 5] },
    { q: 8, op: '÷', a: [0, 3, 4], b: [0, 1, 2] },
    { q: 9, op: '+', a: [1, 1, 2], b: [0, 3, 4] },
    { q: 10, op: '-', a: [2, 1, 3], b: [0, 1, 2] },
  ],
};
const toR = ([w, n, d]) => R(w * d + n, d);
const showOperand = ([w, n, d]) => (w ? `${w} ${n}/${d}` : `${n}/${d}`);
QUIZ.questions.forEach((q) => {
  const x = toR(q.a), y = toR(q.b);
  const v = q.op === '+' ? add(x, y) : q.op === '-' ? sub(x, y) : q.op === 'x' ? mul(x, y) : div(x, y);
  q.prompt = `${showOperand(q.a)} ${q.op === 'x' ? '×' : q.op} ${showOperand(q.b)}`;
  q.key = fmt(v, q.a[0] > 0 || q.b[0] > 0 || q.op === '÷');
});

// --- misconception producers: return the wrong answer string or null if not applicable ---
const M = {
  add_across: (q) => (q.op === '+' || q.op === '-') && !q.a[0] && !q.b[0] ? raw(R(q.op === '+' ? q.a[1] + q.b[1] : q.a[1] - q.b[1], q.op === '+' ? q.a[2] + q.b[2] : Math.abs(q.a[2] - q.b[2]) || 1)) : null,
  numerators_only: (q) => (q.op === '+' || q.op === '-') && !q.a[0] && !q.b[0] && q.a[2] !== q.b[2] ? raw(R(q.op === '+' ? q.a[1] + q.b[1] : q.a[1] - q.b[1], Math.max(q.a[2], q.b[2]))) : null,
  no_invert: (q) => (q.op === '÷' ? raw(mul(toR(q.a), toR(q.b))) : null),
  cross_multiply: (q) => (q.op === 'x' ? raw(R(q.a[1] * q.b[2], q.a[2] * q.b[1])) : null),
  whole_dropped: (q) => (q.a[0] || q.b[0] ? fmt((q.op === '+' ? add : sub)(R(q.a[1], q.a[2]), R(q.b[1], q.b[2])), false) : null),
  unsimplified: (q) => { // equivalent but not lowest terms (marked correct_unsimplified, not wrong)
    const x = toR(q.a), y = toR(q.b);
    const v = q.op === '+' ? add(x, y) : q.op === '-' ? sub(x, y) : q.op === 'x' ? mul(x, y) : div(x, y);
    const s = simp(v); if (s.d === v.d) return null; return raw(v);
  },
  slip: (q) => { const parts = q.key.split(' '); const f = parts.pop(); const [n, d] = f.split('/'); if (!d) return String(Number(n) + 1); return [...parts, `${Number(n) + 1}/${d}`].join(' '); },
};

// --- seeded RNG ---
let seed = 20261115;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const NAMES = ['Aarav Shah', 'Meera Krishnan', 'Rohan Das', 'Ananya Iyer', 'Kabir Singh', 'Diya Menon', 'Arjun Reddy', 'Ishita Rao', 'Vihaan Joshi', 'Saanvi Nair',
  'Aditya Kulkarni', 'Myra Fernandes', 'Reyansh Gupta', 'Kiara Thomas', 'Dhruv Patel', 'Anika Bose', 'Kavin Raj', 'Tara Mehta', 'Neil D\'Souza', 'Zoya Khan',
  'Yash Verma', 'Riya Pillai', 'Samar Malhotra', 'Aisha Siddiqui', 'Ved Chatterjee', 'Nila Sundaram', 'Leo Mathew', 'Pari Agarwal'];

// profiles: which misconceptions a student holds (applied wherever applicable)
const PROFILES = [
  ...Array(7).fill([]), // secure
  ...Array(3).fill(['unsimplified']),
  ...Array(6).fill(['add_across']),
  ...Array(3).fill(['numerators_only']),
  ...Array(3).fill(['no_invert', 'cross_multiply']),
  ...Array(3).fill(['whole_dropped']),
  ['add_across', 'no_invert'],
  ['slip'],
  ['blank'],
];

const students = NAMES.map((name, i) => {
  const profile = PROFILES[i % PROFILES.length];
  const answers = QUIZ.questions.map((q) => {
    let truth = { written: q.key, label: 'correct' };
    for (const m of profile) {
      if (m === 'blank') { if (q.q >= 8) truth = { written: '', label: 'blank' }; continue; }
      if (m === 'slip') { if (q.q === 4 || q.q === 7) truth = { written: M.slip(q), label: 'slip' }; continue; }
      const w = M[m](q);
      if (w && w !== q.key && rnd() < (m === 'unsimplified' ? 0.5 : 0.75)) truth = { written: w, label: m };
    }
    // occasional crossed-out first attempt (final answer unchanged)
    const crossed = rnd() < 0.06 ? pick(['1/2', '2/7', '3/8', '4/5']) : '';
    return { q: q.q, ...truth, crossedOut: crossed };
  });
  return { id: `s${String(i + 1).padStart(2, '0')}`, name, profile, answers };
});

const out = join(here, 'out');
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ quiz: QUIZ, students, generated: '2026-11-15', note: 'Synthetic, fictional students. Ground truth for Tickmark sample class.' }, null, 1));
console.log('key:', QUIZ.questions.map((q) => `${q.q}) ${q.prompt} = ${q.key}`).join(' | '));
const tally = {}; students.forEach((s) => s.answers.forEach((a) => (tally[a.label] = (tally[a.label] || 0) + 1)));
console.log('labels:', tally, 'students:', students.length);
