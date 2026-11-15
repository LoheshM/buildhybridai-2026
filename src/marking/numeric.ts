// Numbers, decimals, percentages and measurements with units. Exact arithmetic on fractions
// (0.1 + 0.2 really is 0.3 here), unit families with conversion, and named mistake patterns.
// Pure: no DOM, no AI.
import { eq, frac, mul, parse, type Frac } from './fraction';

export interface Quantity { value: Frac; unit: string; percent: boolean; text: string; decimals: number }

/** Unit aliases → canonical symbol. Kept small and school-shaped on purpose. */
const ALIASES: Record<string, string> = {
  mm: 'mm', millimetre: 'mm', millimetres: 'mm', millimeter: 'mm', millimeters: 'mm',
  ft: 'ft', foot: 'ft', feet: 'ft', inch: 'in', inches: 'in',
  cms: 'cm', mms: 'mm', kms: 'km', kgs: 'kg', gms: 'g', mls: 'ml',
  cm: 'cm', centimetre: 'cm', centimetres: 'cm', centimeter: 'cm', centimeters: 'cm',
  m: 'm', metre: 'm', metres: 'm', meter: 'm', meters: 'm',
  km: 'km', kilometre: 'km', kilometres: 'km', kilometer: 'km', kilometers: 'km',
  g: 'g', gram: 'g', grams: 'g', kg: 'kg', kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg',
  ml: 'ml', millilitre: 'ml', millilitres: 'ml', milliliter: 'ml', milliliters: 'ml',
  l: 'l', litre: 'l', litres: 'l', liter: 'l', liters: 'l',
  s: 's', sec: 's', secs: 's', second: 's', seconds: 's', min: 'min', mins: 'min', minute: 'min', minutes: 'min',
  h: 'h', hr: 'h', hrs: 'h', hour: 'h', hours: 'h',
  'cm2': 'cm²', 'cm²': 'cm²', 'm2': 'm²', 'm²': 'm²', 'mm2': 'mm²', 'mm²': 'mm²', 'km2': 'km²', 'km²': 'km²',
  'cm3': 'cm³', 'cm³': 'cm³', 'm3': 'm³', 'm³': 'm³', cc: 'cm³',
  '°c': '°C', 'oc': '°C', c: '°C', degrees: '°', degree: '°', '°': '°', deg: '°',
  v: 'V', volt: 'V', volts: 'V', hz: 'Hz', hertz: 'Hz', amp: 'A', amps: 'A', ampere: 'A', amperes: 'A', kelvin: 'K', watt: 'W', watts: 'W', joule: 'J', joules: 'J', pa: 'Pa', pascal: 'Pa', pascals: 'Pa', 'm/s2': 'm/s²', 'm/s²': 'm/s²', 'm/s^2': 'm/s²',
  'km/h': 'km/h', kph: 'km/h', 'm/s': 'm/s', mph: 'mph', n: 'N', newton: 'N', newtons: 'N', j: 'J', w: 'W',
  '$': '$', '£': '£', '₹': '₹', rs: '₹', '€': '€', p: 'p', pence: 'p', cents: '¢', '¢': '¢',
};

/** Families with the factor to the family's base unit (exact fractions). */
const FAMILY: Record<string, [string, Frac]> = {
  ft: ['length', frac(381, 1250)], in: ['length', frac(127, 5000)],
  mm: ['length', frac(1, 1000)], cm: ['length', frac(1, 100)], m: ['length', frac(1)], km: ['length', frac(1000)],
  g: ['mass', frac(1)], kg: ['mass', frac(1000)],
  ml: ['volume', frac(1)], l: ['volume', frac(1000)], 'cm³': ['volume', frac(1)],
  s: ['time', frac(1)], min: ['time', frac(60)], h: ['time', frac(3600)],
  'mm²': ['area', frac(1, 1000000)], 'cm²': ['area', frac(1, 10000)], 'm²': ['area', frac(1)], 'km²': ['area', frac(1000000)],
  p: ['gbp', frac(1, 100)], '£': ['gbp', frac(1)],
};

const unitOf = (raw: string) => {
  const u = raw.trim().toLowerCase().replace(/\^2/, '2').replace(/\^3/, '3').replace(/\.$/, '').replace(/\s+/g, '');
  if (!u) return '';
  // a plural "s" only after a word ("metres"), never after a symbol: "5 ms" is not "5 m"
  return ALIASES[u] ?? (u.length > 3 ? ALIASES[u.replace(/s$/, '')] : undefined) ?? ''; // unknown words are not units ("2x" is algebra)
};

/** Parses "3.5 cm", "-12", "45%", "£4.50", "1,250 g", "0.75". Returns null if it is not one quantity. */
export function parseQuantity(raw: string | null | undefined): Quantity | null {
  let s = (raw ?? '').normalize('NFKC').replace(/[−–—]/g, '-').trim().replace(/[.;:]+$/, '')
    // Indian money: "Rs 50", "₹50/-", "₹ 50 (only)", "1,20,000"
    .replace(/^(?:rs\.?|inr)\s*/i, '₹').replace(/\s*\/-$/, '').replace(/\s*\(?only\)?$/i, '').replace(/^(₹?\s*-?\d{1,2})((?:,\d{2})+),(\d{3})(?!\d)/, (_, a: string, b: string, c: string) => a + b.replace(/,/g, '') + c);
  if (/\(\s*[a-z]\s*\)\s*$/i.test(s)) return null; // "3 (c)": a part letter, not a unit
  if (!s) return null;
  let unit = '';
  const cur = s.match(/^([$£€₹])\s*/);
  if (cur) { unit = cur[1]; s = s.slice(cur[0].length); }
  // thousands separators: "1,250" (but not "1,5" which some students use as a decimal comma)
  // "0,125" is a decimal comma: a number never starts with a thousands group of 0
  s = s.replace(/^(-?0),(\d+)(?=\s*[^\d,]*$)/, '$1.$2').replace(/(\d),(\d{3})(?!\d)/g, '$1$2').replace(/^(-?\d+),(\d{1,2})(?!\d)/, '$1.$2');
  const m = s.match(/^(-?\s*(?:\d+(?:\.\d*)?|\.\d+)(?:\s+\d+\/\d+|\/\d+)?)\s*(%|[^\d\s].*)?$/);
  if (!m) return null;
  // "- 12" → "-12"; "1 1/2" keeps its space (a mixed number)
  const num = m[1].replace(/^-\s+/, '-');
  const p = parse(num);
  if (p.kind !== 'value') return null;
  let rest = (m[2] ?? '').trim();
  const percent = rest === '%';
  if (percent) rest = '';
  if (rest) { const u = unitOf(rest); if (!u || unit) return null; unit = u; }
  if (rest && rest.split(/\s+/).length > 2) return null; // "4 apples and 3 pears" is not one quantity
  const dec = num.includes('.') ? num.split('.')[1].replace(/\D.*$/, '').length : 0;
  return { value: p.value, unit, percent, text: (raw ?? '').trim(), decimals: dec };
}

/** The value as a plain number (percent as a fraction of 1), exact. */
const asNumber = (q: Quantity): Frac => (q.percent ? mul(q.value, frac(1, 100)) : q.value);
const toNum = (f: Frac) => f.n / f.d;

export type NumericMistake = 'sign_error' | 'place_value' | 'percent_decimal' | 'rounding' | 'wrong_unit' | 'missing_unit' | 'decimal_alignment';
export interface NumericVerdict { status: 'correct' | 'partial' | 'wrong' | 'unreadable'; mistake: NumericMistake | null; note?: string }

/**
 * Compares a student's quantity with the key. tolerance is an absolute tolerance in the key's unit
 * (0 = exact, the default). A right value in an equivalent unit (35 mm for 3.5 cm) is correct.
 */
export function markQuantity(keyText: string, readText: string, tolerance = 0, prompt = ''): NumericVerdict {
  const k = parseQuantity(keyText);
  if (!k) return { status: 'unreadable', mistake: null, note: 'The key is not a number.' };
  const s = parseQuantity(readText);
  if (!s) return { status: 'unreadable', mistake: null };
  const kv = asNumber(k), sv = asNumber(s);
  const close = (a: Frac, b: Frac) => (tolerance > 0 ? Math.abs(toNum(a) - toNum(b)) <= tolerance + 1e-12 : eq(a, b));
  // the same number with or without its % sign: "45%" for 45 is right; "45" for 45% is missing its sign
  if (!k.unit && !s.unit && k.percent !== s.percent && eq(k.value, s.value)) {
    if (k.percent) return { status: 'partial', mistake: 'missing_unit', note: 'The % sign is missing' };
    // a percentage question (any wording, Hindi and Tamil too), or no question text: the sign is fine
    if (!prompt.trim() || /(?:as|in)\s+(?:a\s+)?per\s*cent(?:age)?|what\s+per\s*cent(?:age)?|\bpercentage\b|प्रतिशत|சதவீத|शतांश/i.test(prompt)) return { status: 'correct', mistake: null, note: 'Written as a percentage' };
    return { status: 'wrong', mistake: 'wrong_unit', note: 'Check: a % sign on a question that is not about percentages' };
  }

  // "100 °" for a key of "100 °C": the C was not written (or not read); the degree sign says what is meant
  if (k.unit === '°C' && s.unit === '°') s.unit = '°C';
  // units first: the same quantity in a different unit of the same family is right
  if (k.unit && s.unit && k.unit !== s.unit) {
    const fk = FAMILY[k.unit], fs = FAMILY[s.unit];
    if (fk && fs && fk[0] === fs[0]) {
      if (close(mul(kv, fk[1]), mul(sv, fs[1]))) return { status: 'correct', mistake: null, note: `Same amount in ${s.unit}` };
      // the number of the key but in the other unit: forgot to convert
      if (close(kv, sv)) return { status: 'wrong', mistake: 'wrong_unit' };
    } else if (close(kv, sv)) return { status: 'wrong', mistake: 'wrong_unit' };
  }
  if (close(kv, sv)) {
    if (k.unit && !s.unit && !k.percent) return { status: 'partial', mistake: 'missing_unit' };
    if (k.percent !== s.percent && !k.unit) {
      // 45% written as 0.45 is the same value: correct unless the question asked for a percentage
      return k.percent ? { status: 'partial', mistake: 'percent_decimal', note: 'Right value, not written as a percentage' } : { status: 'correct', mistake: null };
    }
    return { status: 'correct', mistake: null };
  }
  const a = toNum(kv), b = toNum(sv);
  if (a !== 0 && close(kv, frac(-sv.n, sv.d))) return { status: 'wrong', mistake: 'sign_error' };
  // "3.5 cm = ? mm" answered 3.5: the number from the question, not converted
  const given = promptQuantity(prompt);
  if (given && given.unit && k.unit && given.unit !== k.unit && eq(given.value, s.value) && !eq(given.value, k.value)) return { status: 'wrong', mistake: 'wrong_unit' };
  // "0.6 + 0.25" answered 0.31: the digits lined up on the right instead of at the decimal point
  const mis = misaligned(prompt);
  if (mis !== null && Math.abs(mis - b) < 1e-9) return { status: 'wrong', mistake: 'decimal_alignment' };
  // percent and decimal mixed up: 0.45 for 45%, or 45 for 0.45, or 0.45% for 45%
  const ratio = a !== 0 ? b / a : NaN;
  const near = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(y));
  if ((k.percent || s.percent || prompt.includes('%')) && (near(ratio, 100) || near(ratio, 0.01))) return { status: 'wrong', mistake: 'percent_decimal' };
  for (const e of [-3, -2, -1, 1, 2, 3]) if (near(ratio, 10 ** e)) return { status: 'wrong', mistake: 'place_value' };
  // rounding: one of them rounds to the other at the coarser precision
  const dp = Math.min(k.decimals, s.decimals);
  if (Math.max(k.decimals, s.decimals) > 0 && Math.abs(a - b) < 10 ** -dp && (round(a, dp) === round(b, dp) || near(Math.abs(a - b), 10 ** -dp))) {
    return { status: 'wrong', mistake: 'rounding' };
  }
  return { status: 'wrong', mistake: null };
}

const round = (x: number, dp: number) => Math.round(x * 10 ** dp) / 10 ** dp;

/** The first measurement printed in a question ("Write 3.5 cm in mm" → 3.5 cm). */
function promptQuantity(prompt: string): Quantity | null {
  const m = (prompt ?? '').match(/(-?\d+(?:\.\d+)?)\s*([a-zA-Z²³°]+)/);
  return m ? parseQuantity(`${m[1]} ${m[2]}`) : null;
}

/** For "a + b" or "a - b" with decimals: the answer a pupil gets by lining the digits up on the right. */
export function misaligned(prompt: string): number | null {
  const m = (prompt ?? '').replace(/[−–]/g, '-').match(/^\s*(\d*\.\d+|\d+)\s*([+-])\s*(\d*\.\d+|\d+)\s*(?:=\s*\??)?\s*$/);
  if (!m) return null;
  const dp = (x: string) => (x.split('.')[1] ?? '').length;
  const da = dp(m[1]), db = dp(m[3]);
  if (da === db) return null;
  const ia = Number(m[1].replace('.', '')), ib = Number(m[3].replace('.', ''));
  const raw = m[2] === '+' ? ia + ib : ia - ib;
  return raw / 10 ** Math.max(da, db);
}

/** Is this key a number, a decimal, a percentage or a measurement (and not a plain fraction)? */
export function looksNumeric(key: string): boolean {
  const q = parseQuantity(key);
  return !!q;
}
