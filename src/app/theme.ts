// Theme: Paper (light) by default; Chalkboard (dark) when the teacher chooses it. Set from a module,
// not an inline script, because the Content Security Policy forbids inline scripts.
export type Theme = 'light' | 'dark';
const KEY = 'tickmark.theme';

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

const syncBar = (t: Theme) => document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'dark' ? '#0a0f20' : '#1d2b55');

export function setTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  syncBar(t);
  try { localStorage.setItem(KEY, t); } catch { /* private mode */ }
}

try { if (localStorage.getItem(KEY) === 'dark') { document.documentElement.dataset.theme = 'dark'; syncBar('dark'); } } catch { /* ignore */ }
