// Matches the name the model read off a sheet ("Weera K", "Araav S.") to the class roster.
// Runs on the laptop only; names are never sent anywhere.

export interface Student { id: string; name: string }
export interface RosterMatch { studentId: string | null; score: number; confident: boolean; candidates: { studentId: string; score: number }[] }

/** Case- and accent-folds Latin text; other scripts keep their vowel signs (only Latin diacritics are removed). */
export const fold = (s: string) =>
  (s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{M}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

/** Jaro-Winkler similarity in [0, 1]. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  if (!a || !b) return 0;
  const range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const am = new Array(a.length).fill(false), bm = new Array(b.length).fill(false);
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(b.length, i + range + 1); j++) {
      if (!bm[j] && a[i] === b[j]) { am[i] = bm[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < a.length; i++) if (am[i]) { while (!bm[k]) k++; if (a[i] !== b[k]) t++; k++; }
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3;
  let p = 0;
  while (p < 4 && a[p] && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

/** Similarity between a read name and a roster name, using first name plus surname or initial. */
export function nameScore(read: string, rosterName: string): number {
  const r = fold(read).split(' ').filter(Boolean), n = fold(rosterName).split(' ').filter(Boolean);
  if (!r.length || !n.length) return 0;
  const first = jaroWinkler(r[0], n[0]);
  if (r.length < 2 || n.length < 2) return first * (r.length === n.length ? 1 : 0.92);
  const rl = r[r.length - 1], nl = n[n.length - 1];
  const last = rl.length <= 1 ? (rl[0] === nl[0] ? 1 : 0.4) : jaroWinkler(rl, nl);
  return 0.7 * first + 0.3 * last;
}

/** Best roster match. Not confident if the best is weak or another student is close behind. */
export function matchName(read: string, roster: Student[], taken: Set<string> = new Set()): RosterMatch {
  const candidates = roster
    .map((s) => ({ studentId: s.id, score: nameScore(read, s.name) }))
    .sort((x, y) => y.score - x.score);
  const free = candidates.filter((c) => !taken.has(c.studentId));
  const best = free[0];
  if (!best || best.score < 0.75) return { studentId: null, score: best?.score ?? 0, confident: false, candidates: candidates.slice(0, 5) };
  const runnerUp = free[1]?.score ?? 0;
  // If someone else's sheet already took a better match, this guess is a fallback: ask the teacher.
  const bestOverall = candidates[0];
  const displaced = bestOverall.studentId !== best.studentId && bestOverall.score >= best.score - 0.02;
  const confident = !displaced && best.score >= 0.86 && best.score - runnerUp >= 0.06 && namesAgree(read, roster.find((s) => s.id === best.studentId)!.name);
  return { studentId: best.studentId, score: best.score, confident, candidates: candidates.slice(0, 5) };
}

/** Optimal-string-alignment distance (adjacent swaps count as one edit). */
export function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    const c = a[i - 1] === b[j - 1] ? 0 : 1;
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
  }
  return d[a.length][b.length];
}

/** Confidence needs the first names to agree closely, and surnames (or initials) not to contradict. */
function namesAgree(read: string, rosterName: string): boolean {
  const r = fold(read).split(' ').filter(Boolean), n = fold(rosterName).split(' ').filter(Boolean);
  if (!r.length || !n.length) return false;
  const firstOk = r[0] === n[0] || (Math.min(r[0].length, n[0].length) >= 5 && editDistance(r[0], n[0]) <= 1);
  if (!firstOk) return false;
  if (r.length < 2 || n.length < 2) return true;
  const rl = r[r.length - 1], nl = n[n.length - 1];
  return rl.length <= 1 ? rl[0] === nl[0] : rl[0] === nl[0] || jaroWinkler(rl, nl) >= 0.85;
}

/** Parses a pasted roster: one student per line. Copes with "1, Name", "Roll<TAB>Name" columns and a header row. */
export function parseRoster(text: string): string[] {
  return (text ?? '')
    .split(/\r?\n/)
    .map((l) => {
      const cells = l.split(/\t|;/).map((c) => c.trim()).filter(Boolean);
      const best = [...cells].sort((a, b) => (b.match(/\p{L}/gu)?.length ?? 0) - (a.match(/\p{L}/gu)?.length ?? 0))[0] ?? '';
      return best.replace(/^\s*\d+[.)\s,-]+/, '').trim();
    })
    .filter((l) => l.length > 0 && l.length <= 60 && /\p{L}/u.test(l))
    .filter((l, i) => !(i === 0 && /^(roll|s\.?\s?no|sr|name|student)\b/i.test(l)));
}
