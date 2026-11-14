// Exact fraction arithmetic and a forgiving parser for handwritten answers.
// Pure: no DOM, no AI. Every mark Tickmark shows is decided here, never by a model.

export interface Frac {
  n: number; // numerator (sign lives here)
  d: number; // denominator, always > 0
}

export type Form = 'integer' | 'fraction' | 'mixed' | 'decimal';

export type Parsed =
  | { kind: 'blank' }
  | { kind: 'value'; value: Frac; form: Form; text: string }
  | { kind: 'multiple'; parts: string[] }
  | { kind: 'unparseable'; text: string };

export const gcd = (a: number, b: number): number => {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
};

export function frac(n: number, d = 1): Frac {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error('fraction parts must be integers');
  if (d === 0) throw new Error('denominator is zero');
  if (d < 0) { n = -n; d = -d; }
  return { n, d };
}

export const simplify = (x: Frac): Frac => { const g = gcd(x.n, x.d) || 1; return { n: x.n / g, d: x.d / g }; };
export const isLowest = (x: Frac): boolean => gcd(x.n, x.d) === 1;
export const eq = (a: Frac, b: Frac): boolean => a.n * b.d === b.n * a.d;
export const add = (a: Frac, b: Frac): Frac => frac(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a: Frac, b: Frac): Frac => frac(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a: Frac, b: Frac): Frac => frac(a.n * b.n, a.d * b.d);
export const div = (a: Frac, b: Frac): Frac => frac(a.n * b.d, a.d * b.n);

export function format(x: Frac, style: 'mixed' | 'improper' = 'mixed'): string {
  const s = simplify(x);
  if (s.d === 1) return String(s.n);
  if (style === 'mixed' && Math.abs(s.n) > s.d) {
    const w = Math.trunc(s.n / s.d);
    return `${w} ${Math.abs(s.n % s.d)}/${s.d}`;
  }
  return `${s.n}/${s.d}`;
}

const VULGAR: Record<string, string> = {
  '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅕': '1/5', '⅖': '2/5', '⅗': '3/5', '⅘': '4/5',
  '⅙': '1/6', '⅚': '5/6', '⅐': '1/7', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅑': '1/9', '⅒': '1/10',
};

/** Normalise model or keyboard text: unicode fractions, minus signs, slashes, spacing. */
export function normalize(raw: string): string {
  // Replace vulgar fractions first: NFKC would turn "1½" into "11⁄2".
  let s = (raw ?? '').replace(/[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅐⅛⅜⅝⅞⅑⅒]/g, (c) => ` ${VULGAR[c]} `).normalize('NFKC');
  s = s.replace(/[⁄∕÷]/g, '/').replace(/[−–—]/g, '-');
  s = s.replace(/(\d)\s*\/\s*(\d)/g, '$1/$2');
  s = s.replace(/^[=\s]+/, '').replace(/[.,;:\s]+$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

const RE_INT = /^-?\d+$/;
const RE_FRAC = /^(-?\d+)\/(\d+)$/;
const RE_MIXED = /^(-?\d+) (\d+)\/(\d+)$/;
const RE_DEC = /^-?(\d+\.\d*|\.\d+)$/;

/** Parse one handwritten answer as read by the model or typed by the teacher. */
export function parse(raw: string | null | undefined): Parsed {
  const text = normalize(raw ?? '');
  if (!text) return { kind: 'blank' };
  const one = parseOne(text);
  if (one) return one;
  // Several values ("3/4 1/2", "2 1/4 1/4") or junk.
  const tokens = text.split(' ');
  if (tokens.length >= 2 && tokens.every((t) => RE_INT.test(t) || RE_FRAC.test(t) || RE_DEC.test(t))) {
    return { kind: 'multiple', parts: groupParts(tokens) };
  }
  return { kind: 'unparseable', text };
}

function parseOne(text: string): Parsed | null {
  let m: RegExpMatchArray | null;
  if (RE_INT.test(text)) return { kind: 'value', value: frac(Number(text)), form: 'integer', text };
  if ((m = text.match(RE_FRAC))) {
    if (Number(m[2]) === 0) return null;
    return { kind: 'value', value: frac(Number(m[1]), Number(m[2])), form: 'fraction', text };
  }
  if ((m = text.match(RE_MIXED))) {
    const w = Number(m[1]), n = Number(m[2]), d = Number(m[3]);
    if (d === 0 || n >= d) return null; // "2 5/3" is not a mixed number
    const sign = m[1].startsWith('-') ? -1 : 1;
    return { kind: 'value', value: frac(sign * (Math.abs(w) * d + n), d), form: 'mixed', text };
  }
  if (RE_DEC.test(text)) {
    const [i, f = ''] = text.replace('-', '').split('.');
    const d = 10 ** f.length;
    const n = Number(i || '0') * d + Number(f || '0');
    return { kind: 'value', value: frac(text.startsWith('-') ? -n : n, d), form: 'decimal', text };
  }
  return null;
}

/** Re-join "2", "1/4" into "2 1/4" where that forms a valid mixed number, for display. */
function groupParts(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i], next = tokens[i + 1];
    if (RE_INT.test(t) && next && RE_FRAC.test(next) && parseOne(`${t} ${next}`)) { out.push(`${t} ${next}`); i++; }
    else out.push(t);
  }
  return out;
}

/**
 * A read like "11/2" may really be the mixed number "1 1/2" with the space lost.
 * Returns the alternative mixed-number readings of a compact fraction string.
 */
export function mixedAlternatives(text: string): string[] {
  const m = normalize(text).match(/^(\d{2,})\/(\d+)$/);
  if (!m) return [];
  const alts: string[] = [];
  const digits = m[1];
  for (let cut = 1; cut < digits.length; cut++) {
    const cand = `${digits.slice(0, cut)} ${digits.slice(cut)}/${m[2]}`;
    if (parseOne(cand)) alts.push(cand);
  }
  return alts;
}

export type Op = '+' | '-' | '×' | '÷';
export interface Expr { a: Frac; aText: string; op: Op; b: Frac; bText: string }

/** Parse a question prompt like "2/3 + 1/6", "1 1/2 + 3/4", "3/4 ÷ 1/2", "2/3 x 3/5". */
export function parseExpr(prompt: string): Expr | null {
  const s = normalize(prompt.replace(/=\s*$/, '')).replace(/\s*[x*×]\s*/g, ' × ').replace(/\s*:\s*/g, ' ÷ ');
  const m = s.match(/^(-?\d+(?: \d+\/\d+)?|-?\d+\/\d+)\s*([+\-×÷])\s*(-?\d+(?: \d+\/\d+)?|-?\d+\/\d+)$/);
  if (!m) {
    // "/" between two fractions means divide only if written with spaces: "3/4 / 1/2"
    const d = s.match(/^(\S+(?: \d+\/\d+)?) \/ (\S+(?: \d+\/\d+)?)$/);
    if (!d) return null;
    return build(d[1], '÷', d[2]);
  }
  return build(m[1], m[2] as Op, m[3]);
}

function build(aT: string, op: Op, bT: string): Expr | null {
  const a = parseOne(aT), b = parseOne(bT);
  if (!a || a.kind !== 'value' || !b || b.kind !== 'value') return null;
  if (op === '÷' && b.value.n === 0) return null;
  return { a: a.value, aText: aT, op, b: b.value, bText: bT };
}

export function evaluate(e: Expr): Frac {
  switch (e.op) {
    case '+': return add(e.a, e.b);
    case '-': return sub(e.a, e.b);
    case '×': return mul(e.a, e.b);
    case '÷': return div(e.a, e.b);
  }
}

/** Canonical text of an expression rebuilt from numbers only (safe to send anywhere). */
export function exprText(e: Expr): string {
  const t = (x: Frac, orig: string) => (/ /.test(orig) ? format(x, 'mixed') : orig.includes('/') ? `${x.n}/${x.d}` : String(x.n));
  return `${t(e.a, e.aText)} ${e.op} ${t(e.b, e.bText)}`;
}
