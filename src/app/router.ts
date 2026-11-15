// Tiny hash router. Routes carry ids only, never names, so URLs and history leak nothing.
import { useEffect, useState } from 'react';

export type Route =
  | { page: 'welcome' }
  | { page: 'home' }
  | { page: 'new' }
  | { page: 'scan'; quizId: string }
  | { page: 'check'; quizId: string; sheetId?: string; q?: number }
  | { page: 'results'; quizId: string }
  | { page: 'reteach'; quizId: string }
  | { page: 'privacy' };

export function parseHash(h: string): Route {
  const p = h.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'classes') return { page: 'home' };
  if (p[0] === 'new') return { page: 'new' };
  if (p[0] === 'privacy') return { page: 'privacy' };
  if (p[0] === 'quiz' && p[1]) {
    const quizId = decodeURIComponent(p[1]);
    if (p[2] === 'check' && p[3] === 'q' && p[4]) return { page: 'check', quizId, q: Number(p[4]) || 1 };
    if (p[2] === 'check' && p[3] === 'sheet' && p[4]) return { page: 'check', quizId, sheetId: decodeURIComponent(p[4]) };
    if (p[2] === 'check') return { page: 'check', quizId, sheetId: p[3] ? decodeURIComponent(p[3]) : undefined }; // v1 links
    if (p[2] === 'results') return { page: 'results', quizId };
    if (p[2] === 'reteach') return { page: 'reteach', quizId };
    return { page: 'scan', quizId };
  }
  return { page: 'welcome' };
}

export const href = {
  welcome: () => '#/',
  home: () => '#/classes',
  new: () => '#/new',
  privacy: () => '#/privacy',
  scan: (q: string) => `#/quiz/${encodeURIComponent(q)}`,
  check: (q: string, s?: string) => `#/quiz/${encodeURIComponent(q)}/check${s ? `/sheet/${encodeURIComponent(s)}` : ''}`,
  checkQ: (q: string, n: number) => `#/quiz/${encodeURIComponent(q)}/check/q/${n}`,
  results: (q: string) => `#/quiz/${encodeURIComponent(q)}/results`,
  reteach: (q: string) => `#/quiz/${encodeURIComponent(q)}/reteach`,
};

export function useRoute(): Route {
  const [r, setR] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const on = () => { setR(parseHash(location.hash)); window.scrollTo(0, 0); };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return r;
}

export const go = (h: string) => { location.hash = h; };
