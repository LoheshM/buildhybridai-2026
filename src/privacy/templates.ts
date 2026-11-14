// Parent-note templates come back from the cloud with placeholders; the laptop fills in each
// child's name and score. Templates with missing or extra placeholders are rejected.

export const PLACEHOLDERS = ['{{student}}', '{{score}}', '{{total}}'] as const;
const RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export function placeholdersIn(t: string): string[] {
  return [...(t ?? '').matchAll(RE)].map((m) => `{{${m[1].toLowerCase()}}}`);
}

/** A template is valid when it uses each placeholder at least once and no unknown ones. */
export function validTemplate(t: string): boolean {
  if (!t || t.length > 1200) return false;
  if (/[{}]/.test(t.replace(RE, ''))) return false; // damaged braces such as {{ छात्र }} or {{{student}}}
  const found = placeholdersIn(t);
  const set = new Set(found);
  return found.every((p) => (PLACEHOLDERS as readonly string[]).includes(p)) && set.has('{{student}}');
}

/** Fill placeholders as plain text (callers render it as text, never as HTML). */
export function fillTemplate(t: string, v: { student: string; score: string | number; total: string | number }): string {
  return t.replace(RE, (_m, key: string) => {
    const k = key.toLowerCase();
    if (k === 'student') return v.student;
    if (k === 'score') return String(v.score);
    if (k === 'total') return String(v.total);
    return '';
  });
}

/** Built-in English notes, used offline or when a cloud template fails validation. */
export const FALLBACK_NOTES: Record<string, string> = {
  default: 'Dear parent of {{student}}, {{student}} scored {{score}} out of {{total}} on this week\'s fractions check. We will keep practising in class. Thank you!',
  add_across: 'Dear parent of {{student}}, {{student}} scored {{score}} out of {{total}} on the fractions check. When adding fractions, {{student}} sometimes adds the tops and the bottoms. A quick home activity: cut a paper strip into halves and quarters and add them together. Thank you!',
  numerators_only: 'Dear parent of {{student}}, {{student}} scored {{score}} out of {{total}} on the fractions check. {{student}} is learning to make the bottom numbers the same before adding. Ask {{student}} to explain why 1/2 + 1/4 is 3/4. Thank you!',
  secure: 'Dear parent of {{student}}, well done! {{student}} scored {{score}} out of {{total}} on this week\'s fractions check. Please say well done at home!',
};

/** An answer cell: numbers and fractions are written as text formulas so spreadsheets do not turn 3/4 into a date. */
export function csvAnswer(v: string): string {
  const s = String(v ?? '').trim();
  if (s && /^[-0-9 ./]+$/.test(s)) return `"=""${s}"""`;
  return csvCell(s);
}

/** CSV cell guard: neutralises values a spreadsheet would treat as a formula. */
export function csvCell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
