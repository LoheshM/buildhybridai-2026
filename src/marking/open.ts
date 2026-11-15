// Open answers (short answers with key points, paragraphs with a rubric). Gemini Nano only
// suggests; this file turns its raw output into points in code, and records the teacher's decision.
import { outOfFor, statusFromPoints, typeOf, type Marked, type QuestionKey, type Suggestion } from './mark';
import type { MistakeId } from './mistakes';
import { keyPoints, parseRubric } from './qtypes';

export interface RawSuggestion { missing?: unknown; mark?: unknown; reason?: unknown; [k: string]: unknown }

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const half = (x: number) => Math.round(x * 2) / 2;

/** Raw model output → a suggestion with points computed here. Null if the output is unusable. */
export function toSuggestion(key: QuestionKey, raw: RawSuggestion | null | undefined, where: Suggestion['where'], ms: number): Suggestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const type = typeOf(key);
  const outOf = outOfFor(key);
  const reason = typeof raw.reason === 'string' ? raw.reason.replace(/\s+/g, ' ').trim().slice(0, 240) : '';
  if (type === 'passage') {
    const rubric = parseRubric(key.answer) ?? [];
    if (!rubric.length) return null;
    const lines = rubric.map((r, i) => {
      const v = Number(raw[`l${i + 1}`]);
      return { score: Number.isFinite(v) ? clamp(Math.round(v), 0, r.max) : 0, max: r.max };
    });
    if (rubric.some((_, i) => !Number.isFinite(Number(raw[`l${i + 1}`])))) return null;
    const total = lines.reduce((a, l) => a + l.score, 0);
    const max = lines.reduce((a, l) => a + l.max, 0) || 1;
    return { points: half((total / max) * outOf), outOf, lines, reason, where, ms };
  }
  if (type !== 'short') return null;
  const n = keyPoints(key.answer).length || 1;
  const mark = raw.mark === 'full' || raw.mark === 'partial' || raw.mark === 'none' ? raw.mark : null;
  if (!mark) return null;
  const missing = new Set((Array.isArray(raw.missing) ? raw.missing : []).map(Number).filter((x) => Number.isInteger(x) && x >= 1 && x <= n));
  let met = Array.from({ length: n }, (_, i) => !missing.has(i + 1));
  // the holistic mark wins (it agreed best with human markers); the list only names what is missing
  if (mark === 'full') met = met.map(() => true);
  if (mark === 'none') met = met.map(() => false);
  if (mark === 'partial' && met.every(Boolean)) met[n - 1] = false; // "partial" with nothing missing: too vague somewhere
  if (mark === 'partial' && !met.some(Boolean) && n > 1) met[0] = true;
  const count = met.filter(Boolean).length;
  const points = mark === 'full' ? outOf : mark === 'none' ? 0 : n === 1 ? half(outOf / 2) : clamp(half((count / n) * outOf), 0.5, outOf - 0.5);
  return { points, outOf, met, contradicts: mark === 'none' && missing.size < n, reason, where, ms };
}

/** Mistake labels for an open answer from its met key points / rubric lines (fixed ids only). */
export function openMistakes(key: QuestionKey, s: { met?: boolean[]; contradicts?: boolean; lines?: { score: number; max: number }[] }): MistakeId[] {
  const out: MistakeId[] = [];
  s.met?.forEach((ok, i) => { if (!ok && i < 6) out.push(`missing_point_${i + 1}` as MistakeId); });
  if (s.contradicts) out.push('contradicts');
  s.lines?.forEach((l, i) => { if (i < 4 && l.score * 2 <= l.max) out.push(`rubric_low_${i + 1}` as MistakeId); });
  void key;
  return out;
}

/**
 * The teacher's decision on an open answer: accept the suggestion, or set the points (and, for a
 * short answer, which key points were stated). The status and mistake labels follow from it.
 */
export function decideOpen(key: QuestionKey, m: Marked, d: { points?: number; met?: boolean[]; lines?: { score: number; max: number }[] } = {}): Marked {
  const outOf = m.outOf ?? outOfFor(key);
  const s = m.suggestion;
  const lines = d.lines ?? s?.lines;
  const met = d.met ?? s?.met;
  let points = d.points ?? (d.lines ? d.lines.reduce((a, l) => a + l.score, 0) * outOf / Math.max(1, d.lines.reduce((a, l) => a + l.max, 0)) : undefined)
    ?? (d.met ? (d.met.filter(Boolean).length / Math.max(1, d.met.length)) * outOf : undefined) ?? s?.points;
  if (points === undefined) return m; // nothing to decide from
  points = clamp(half(points), 0, outOf);
  const status = statusFromPoints(points, outOf);
  const mistakes = status === 'correct' ? [] : openMistakes(key, { met: status === 'wrong' && !met ? undefined : met, contradicts: !d.met && !d.points && s?.contradicts, lines });
  const changed = !!s && (points !== s.points || (!!d.met && JSON.stringify(d.met) !== JSON.stringify(s.met)));
  return { ...m, status, points, mistakes, misconception: null, checked: true, flags: changed ? [...new Set([...m.flags.filter((f) => f === 'crossed_out'), 'teacher_changed' as const])] : m.flags.filter((f) => f !== 'teacher_changed') };
}
