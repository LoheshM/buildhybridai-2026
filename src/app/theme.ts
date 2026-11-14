// Theme: Paper (light) by default; Chalkboard (dark) when the teacher chooses it. Set from a module,
// not an inline script, because the Content Security Policy forbids inline scripts.
export type Theme = 'light' | 'dark';
const KEY = 'tickmark.theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
}

try { if (localStorage.getItem(KEY) === 'dark') document.documentElement.dataset.theme = 'dark'; } catch { /* ignore */ }
