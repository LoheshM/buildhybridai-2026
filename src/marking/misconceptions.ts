// Deterministic misconception detectors. Each one recomputes what a student would get by
// following a known wrong procedure and checks whether the student's value matches it.
// Order matters: the most specific, most common explanation wins.
import { add, div, eq, frac, mul, sub, type Expr, type Frac } from './fraction';

export const MISCONCEPTIONS = {
  add_across: {
    label: 'Added (or subtracted) tops and bottoms',
    teacher: 'Combined numerators and denominators straight across, e.g. 2/3 + 1/6 = 3/9.',
  },
  numerators_only: {
    label: 'Combined tops, kept a bottom',
    teacher: 'Added or subtracted the numerators but kept one denominator without converting.',
  },
  denominators_multiplied: {
    label: 'Multiplied bottoms, added tops',
    teacher: 'Multiplied the denominators but did not rescale the numerators.',
  },
  whole_dropped: {
    label: 'Lost the whole number',
    teacher: 'Worked with the fraction parts of a mixed number and dropped the whole-number part.',
  },
  cross_multiply: {
    label: 'Cross-multiplied when multiplying',
    teacher: 'Multiplied diagonally (as if dividing) instead of top × top, bottom × bottom.',
  },
  no_invert: {
    label: 'Divided without flipping',
    teacher: 'Multiplied straight across instead of multiplying by the reciprocal.',
  },
  flipped_first: {
    label: 'Flipped the wrong fraction',
    teacher: 'Took the reciprocal of the first fraction instead of the divisor.',
  },
  reversed_subtraction: {
    label: 'Subtracted the wrong way round',
    teacher: 'Took the smaller from the larger, giving the right size with the wrong sign.',
  },
  wrong_operation: {
    label: 'Used a different operation',
    teacher: 'The answer matches a different operation on the same two numbers.',
  },
  slip: {
    label: 'Arithmetic slip',
    teacher: 'One number is off by one from the correct answer: likely a slip, not a misconception.',
  },
} as const;

export type MisconceptionId = keyof typeof MISCONCEPTIONS;

const props = (x: Frac) => ({ w: Math.trunc(x.n / x.d), r: frac(x.n % x.d, x.d) });

/** Returns the first detector that explains `answer` for `expr`, or null. */
export function detect(expr: Expr, answer: Frac): MisconceptionId | null {
  const { a, b, op } = expr;
  const tries: [MisconceptionId, () => Frac | Frac[] | null][] = [
    ['add_across', () => {
      if (op !== '+' && op !== '-') return null;
      const pa = props(a), pb = props(b);
      // with mixed numbers, students often add wholes and add fraction parts across
      const fa = pa.r, fb = pb.r;
      const top = op === '+' ? fa.n + fb.n : fa.n - fb.n;
      const bot = op === '+' ? fa.d + fb.d : Math.abs(fa.d - fb.d);
      if (bot === 0) return null;
      const whole = op === '+' ? pa.w + pb.w : pa.w - pb.w;
      return add(frac(whole), frac(top, bot));
    }],
    ['numerators_only', () => {
      if ((op !== '+' && op !== '-') || a.d === b.d) return null;
      const top = op === '+' ? a.n + b.n : a.n - b.n;
      return [frac(top, a.d), frac(top, b.d)];
    }],
    ['denominators_multiplied', () => {
      if ((op !== '+' && op !== '-') || a.d === b.d) return null;
      return frac(op === '+' ? a.n + b.n : a.n - b.n, a.d * b.d);
    }],
    ['whole_dropped', () => {
      const pa = props(a), pb = props(b);
      if (!pa.w && !pb.w) return null;
      const f = op === '+' ? add : op === '-' ? sub : op === '×' ? mul : div;
      if (op === '÷' && pb.r.n === 0) return null;
      return f(pa.r, pb.r);
    }],
    ['cross_multiply', () => (op === '×' && b.n !== 0 ? frac(a.n * b.d, a.d * b.n) : null)],
    ['no_invert', () => (op === '÷' ? mul(a, b) : null)],
    ['flipped_first', () => (op === '÷' && a.n !== 0 ? frac(a.d * b.n, a.n * b.d) : null)],
    ['reversed_subtraction', () => (op === '-' ? sub(b, a) : null)],
    ['wrong_operation', () => {
      const out: Frac[] = [];
      if (op !== '+') out.push(add(a, b));
      if (op !== '-') out.push(sub(a, b));
      if (op !== '×') out.push(mul(a, b));
      if (op !== '÷' && b.n !== 0) out.push(div(a, b));
      return out;
    }],
  ];
  const correct = evalExpr(expr);
  for (const [id, fn] of tries) {
    const r = fn();
    if (!r) continue;
    const list = Array.isArray(r) ? r : [r];
    if (list.some((x) => !eq(x, correct) && eq(x, answer))) return id;
  }
  if (isSlip(correct, answer)) return 'slip';
  return null;
}

function evalExpr(e: Expr): Frac {
  return e.op === '+' ? add(e.a, e.b) : e.op === '-' ? sub(e.a, e.b) : e.op === '×' ? mul(e.a, e.b) : div(e.a, e.b);
}

/** Off by one in the numerator or denominator of the simplified answer. */
function isSlip(correct: Frac, answer: Frac): boolean {
  const g = (x: Frac) => { const k = Math.abs(gcdN(x.n, x.d)) || 1; return { n: x.n / k, d: x.d / k }; };
  const off = (c: Frac, s: Frac) => (c.d === s.d && Math.abs(c.n - s.n) === 1) || (c.n === s.n && Math.abs(c.d - s.d) === 1 && s.d > 0);
  const c = g(correct);
  // compare as written (12/15 vs 11/15) and in lowest terms, also against the correct value on the answer's denominator
  const scaled = answer.d % c.d === 0 ? { n: (c.n * answer.d) / c.d, d: answer.d } : null;
  return off(c, g(answer)) || off(c, answer) || (!!scaled && off(scaled, answer));
}
const gcdN = (a: number, b: number): number => (b ? gcdN(b, a % b) : a);
