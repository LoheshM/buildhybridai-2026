// Algebra answers: "x = 4", "4", "2x + 6", "3(x + 2)". Equivalence by substitution at several
// points (exact enough for school polynomials), plus named mistakes for linear equations.
// Pure: no DOM, no AI.

type Tok = { t: 'num'; v: number } | { t: 'var'; v: string } | { t: 'op'; v: string };

function tokenize(src: string): Tok[] | null {
  const s = src.normalize('NFKC').replace(/[−–—]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/\s+/g, '');
  const out: Tok[] = [];
  for (let i = 0; i < s.length;) {
    const c = s[i];
    const num = s.slice(i).match(/^(\d+(?:\.\d+)?|\.\d+)/);
    if (num) { out.push({ t: 'num', v: Number(num[1]) }); i += num[1].length; continue; }
    if (/[a-z]/i.test(c)) { out.push({ t: 'var', v: c.toLowerCase() }); i++; continue; }
    if ('+-*/^()'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    return null;
  }
  // implicit multiplication: 2x, 2(x), x(x), )( , )x, x2? (x2 is unusual: refuse by leaving it)
  const res: Tok[] = [];
  for (const tk of out) {
    const prev = res[res.length - 1];
    const prevEnds = prev && (prev.t === 'num' || prev.t === 'var' || (prev.t === 'op' && prev.v === ')'));
    const curStarts = tk.t === 'var' || (tk.t === 'op' && tk.v === '(') || (tk.t === 'num' && prev?.t !== 'num');
    if (prevEnds && curStarts && !(prev.t === 'var' && tk.t === 'num')) res.push({ t: 'op', v: '*' });
    res.push(tk);
  }
  return res;
}

export type Fn = (vars: Record<string, number>) => number;

/** Recursive-descent parser → evaluator. Returns null for anything it can't parse. */
export function compile(src: string): { fn: Fn; vars: Set<string> } | null {
  const toks = tokenize(src);
  if (!toks || !toks.length) return null;
  let i = 0;
  const vars = new Set<string>();
  const peek = () => toks[i];
  const eat = (v?: string) => { const t = toks[i]; if (v !== undefined && !(t?.t === 'op' && t.v === v)) throw 0; i++; return t; };
  const expr = (): Fn => {
    let f = term();
    while (peek()?.t === 'op' && (peek()!.v === '+' || peek()!.v === '-')) {
      const op = eat().v; const g = term(); const a = f;
      f = op === '+' ? (x) => a(x) + g(x) : (x) => a(x) - g(x);
    }
    return f;
  };
  const term = (): Fn => {
    let f = power();
    while (peek()?.t === 'op' && (peek()!.v === '*' || peek()!.v === '/')) {
      const op = eat().v; const g = power(); const a = f;
      f = op === '*' ? (x) => a(x) * g(x) : (x) => a(x) / g(x);
    }
    return f;
  };
  const power = (): Fn => {
    const b = unary();
    if (peek()?.t === 'op' && peek()!.v === '^') { eat(); const e = unary(); return (x) => b(x) ** e(x); }
    return b;
  };
  const unary = (): Fn => {
    if (peek()?.t === 'op' && peek()!.v === '-') { eat(); const f = unary(); return (x) => -f(x); }
    if (peek()?.t === 'op' && peek()!.v === '+') { eat(); return unary(); }
    return atom();
  };
  const atom = (): Fn => {
    const t = eat();
    if (!t) throw 0;
    if (t.t === 'num') { const v = t.v; return () => v; }
    if (t.t === 'var') { const v = t.v; vars.add(v); return (x) => x[v] ?? NaN; }
    if (t.v === '(') { const f = expr(); eat(')'); return f; }
    throw 0;
  };
  try {
    const fn = expr();
    if (i !== toks.length) return null;
    return { fn, vars };
  } catch { return null; }
}

const POINTS = [1.37, -2.21, 3.73, 0.59];

/** Same function of the same variable(s) at several points. */
export function equivalent(a: string, b: string): boolean {
  const A = compile(a), B = compile(b);
  if (!A || !B) return false;
  const names = [...new Set([...A.vars, ...B.vars])];
  return POINTS.every((p, j) => {
    const env = Object.fromEntries(names.map((n, k) => [n, POINTS[(j + k) % POINTS.length] * (k + 1) || p]));
    const x = A.fn(env), y = B.fn(env);
    return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));
  });
}

/** "x = 4" → { variable: 'x', rhs: '4' }; "4" → { rhs: '4' }. */
export function splitAssignment(s: string): { variable?: string; rhs: string } {
  const m = s.trim().match(/^([a-z])\s*=\s*(.+)$/i);
  return m ? { variable: m[1].toLowerCase(), rhs: m[2] } : { rhs: s.trim() };
}

/** Is a key "x = 4" or an algebraic expression like "2x + 3" (and not plain arithmetic)? */
export function looksAlgebraic(key: string): boolean {
  const k = key.trim();
  if (/^[a-z]\s*=\s*-?[\d./ ]+$/i.test(k)) return true;
  const c = compile(k);
  return !!c && c.vars.size >= 1 && c.vars.size <= 2 && /[+\-*/^()]|\d[a-z]/i.test(k);
}

const value = (s: string): number | null => {
  const c = compile(s);
  if (!c || c.vars.size) return null;
  const v = c.fn({});
  return Number.isFinite(v) ? v : null;
};

export type AlgebraMistake = 'sign_error' | 'inverse_operation' | 'not_solved';
export interface AlgebraVerdict { status: 'correct' | 'wrong' | 'unreadable'; mistake: AlgebraMistake | null }

/**
 * Solves a linear equation "2x + 3 = 11" by evaluating both sides at two points, and lists the
 * answers produced by the common wrong procedures (undoing with the same operation, wrong order).
 */
export function linearEquation(prompt: string): { variable: string; solution: number; wrong: Map<number, AlgebraMistake> } | null {
  const parts = prompt.split('=');
  if (parts.length !== 2) return null;
  const L = compile(parts[0]), R = compile(parts[1]);
  if (!L || !R) return null;
  const vars = new Set([...L.vars, ...R.vars]);
  if (vars.size !== 1) return null;
  const v = [...vars][0];
  const f = (x: number) => L.fn({ [v]: x }) - R.fn({ [v]: x });
  const b = f(0), a = f(1) - b;
  if (Math.abs(f(2) - (2 * a + b)) > 1e-9 || a === 0) return null; // not linear
  const solution = -b / a;
  const wrong = new Map<number, AlgebraMistake>();
  // ax + c = d: the common slips, computed from the left side's own numbers
  const c0 = L.fn({ [v]: 0 }), a0 = L.fn({ [v]: 1 }) - c0, d = R.vars.size ? NaN : R.fn({});
  if (Number.isFinite(d) && a0 !== 0) {
    const add = (x: number, m: AlgebraMistake) => { if (Number.isFinite(x) && Math.abs(x - solution) > 1e-9 && !wrong.has(round6(x))) wrong.set(round6(x), m); };
    add((d + c0) / a0, 'inverse_operation'); // added the constant instead of subtracting it
    add((d - c0) * a0, 'inverse_operation'); // multiplied by the coefficient instead of dividing
    add(d / a0 - c0, 'inverse_operation'); // divided first, then subtracted
    add(d - c0 - a0, 'inverse_operation'); // subtracted the coefficient
    add(-solution, 'sign_error');
  }
  return { variable: v, solution, wrong };
}
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export function markAlgebra(keyText: string, readText: string, prompt = ''): AlgebraVerdict {
  const read = readText.trim();
  if (!read) return { status: 'unreadable', mistake: null };
  const key = splitAssignment(keyText);
  const ans = splitAssignment(read);
  if (ans.variable && key.variable && ans.variable !== key.variable) return { status: 'wrong', mistake: null };
  const kv = value(key.rhs);
  if (kv !== null) {
    // the key is a value: the student must give a value
    const sv = value(ans.rhs);
    // "2x = 8" or "2x + 3": an equation or expression left unsolved
    const unsolved = compile(ans.rhs) || (ans.rhs.split('=').length === 2 && ans.rhs.split('=').every((s) => compile(s)));
    if (sv === null) return unsolved ? { status: 'wrong', mistake: 'not_solved' } : { status: 'unreadable', mistake: null };
    if (Math.abs(sv - kv) <= 1e-9 * Math.max(1, Math.abs(kv))) return { status: 'correct', mistake: null };
    const eqn = prompt ? linearEquation(prompt) : null;
    const hit = eqn?.wrong.get(round6(sv));
    if (hit) return { status: 'wrong', mistake: hit };
    if (kv !== 0 && Math.abs(sv + kv) <= 1e-9 * Math.abs(kv)) return { status: 'wrong', mistake: 'sign_error' };
    return { status: 'wrong', mistake: null };
  }
  if (!compile(ans.rhs)) return { status: 'unreadable', mistake: null };
  if (equivalent(key.rhs, ans.rhs)) return { status: 'correct', mistake: null };
  // one sign flipped somewhere: try negating each term of the student's answer
  const terms = ans.rhs.replace(/\s+/g, '').split(/(?=[+-])/);
  for (let i = 0; i < terms.length && terms.length > 1; i++) {
    const flipped = terms.map((t, j) => (j === i ? (t.startsWith('-') ? '+' + t.slice(1) : t.startsWith('+') ? '-' + t.slice(1) : '-' + t) : t)).join('');
    if (equivalent(key.rhs, flipped)) return { status: 'wrong', mistake: 'sign_error' };
  }
  return { status: 'wrong', mistake: null };
}
