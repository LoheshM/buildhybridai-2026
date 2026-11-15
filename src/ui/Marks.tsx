// Marks are the signature of Tickmark: red ink for a mark code or the teacher made, graphite
// pencil for a mark Gemini Nano only suggested. Every status has its own SHAPE (tick, cross,
// half-tick, dash, question), so the register reads in greyscale too.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Marked, Status } from '../marking/mark';
import { needsCheck } from '../marking/pipeline';

const TICK = 'M4 13.5C6.5 15.5 8.5 18 10 21C13 14 17 8.5 22 4';
const CROSS = ['M6 6C10.5 10.5 13.5 13.5 18 18', 'M18 6C13.5 10.5 10.5 14 6 18'];
// a teacher's half mark: the tick with a short stroke through its long arm
const HALF = ['M4 13.5C6.5 15.5 8.5 18 10 21C13 14 17 8.5 22 4', 'M11.5 8.5C14 10.5 16.5 12.5 19 14.5'];
const RING = 'M58 5C26 1 5 13 5 30C6 50 46 57 76 50C97 45 99 21 77 10C66 5 52 4 40 7';

export type Hand = 'ink' | 'pencil';

/** Draws the mark; `draw` replays the stroke once (the pencil-to-pen moment). */
export function Mk({ status, hand = 'ink', draw = false, needs = false, label }: { status: Status | 'suggest-full' | 'suggest-part' | 'suggest-none'; hand?: Hand; draw?: boolean; needs?: boolean; label?: string }) {
  const cls = `mk ${hand}${draw ? ' draw' : ''}${needs ? ' needs' : ''}`;
  const aria = label ?? ARIA[status] ?? status;
  // pathLength only on ink: it also stretches a dash pattern, which hid the pencil's dashes
  const svg = (paths: string[]) => (
    <>
      {draw && hand === 'ink' && <svg className="ghost" viewBox="0 0 26 26" aria-hidden="true">{paths.map((d) => <path key={d} d={d} />)}</svg>}
      <svg viewBox="0 0 26 26" aria-hidden="true">{paths.map((d) => (hand === 'ink' ? <path key={d} pathLength={1} d={d} /> : <path key={d} d={d} />))}</svg>
    </>
  );
  switch (status) {
    case 'correct': case 'suggest-full': return <span className={cls} role="img" aria-label={aria}>{svg([TICK])}</span>;
    case 'wrong': case 'suggest-none': return <span className={cls} role="img" aria-label={aria}>{svg(CROSS)}</span>;
    case 'unsimplified': case 'partial': case 'suggest-part': return <span className={cls} role="img" aria-label={aria}>{svg(HALF)}</span>;
    case 'blank': return <span className="mk blank" role="img" aria-label={aria}><span className="t">–</span></span>;
    case 'pending': return <span className={`mk open${needs ? ' needs' : ''}`} role="img" aria-label={aria}><span className="t">…</span></span>;
    default: return <span className={`mk ${hand}${needs ? ' needs' : ''}`} role="img" aria-label={aria}><span className="t">?</span></span>;
  }
}
const ARIA: Record<string, string> = {
  correct: 'Right', wrong: 'Wrong', unsimplified: 'Right but not simplified', partial: 'Some marks', blank: 'Blank',
  pending: 'Waiting for your decision', unreadable: "Couldn't read", 'suggest-full': 'Suggested: full marks', 'suggest-part': 'Suggested: some marks', 'suggest-none': 'Suggested: no marks',
};

/** The mark for one answer as the register shows it: pencil while Nano's suggestion waits, ink once decided. */
export function AnswerMark({ m, draw = false }: { m: Marked; draw?: boolean }) {
  if (m.status === 'pending' && m.suggestion) {
    const s = m.suggestion;
    const st = s.points >= s.outOf ? 'suggest-full' : s.points <= 0 ? 'suggest-none' : 'suggest-part';
    return <Mk status={st} hand="pencil" needs />;
  }
  return <Mk status={m.status} hand="ink" draw={draw} needs={needsCheck(m)} />;
}

/** Plays the stroke once when a mark goes from pencil (or nothing) to ink. */
export function useInkMoment(key: string, decided: boolean) {
  const prev = useRef(decided);
  const [draw, setDraw] = useState(false);
  useEffect(() => {
    if (!prev.current && decided) setDraw(true);
    prev.current = decided;
    const t = setTimeout(() => setDraw(false), 600);
    return () => clearTimeout(t);
  }, [key, decided]);
  return draw;
}

export function ScoreRing({ points, outOf, open = false, big = false, draw = false }: { points: number; outOf: number; open?: boolean; big?: boolean; draw?: boolean }) {
  const p = fmtPoints(points);
  return (
    <span className={`score${big ? ' big' : ''}${open ? ' open' : ''}${draw ? ' draw' : ''}`} role="img" aria-label={open ? `Score so far ${points} of ${outOf}, not final` : `Score ${points} out of ${outOf}`}>
      <svg viewBox="0 0 100 56" preserveAspectRatio="none" aria-hidden="true">{open ? <path d={RING} /> : <path pathLength={1} d={RING} />}</svg>
      <span>{p}<small>/{fmtPoints(outOf)}</small>{open && <span className="sofar">so far</span>}</span>
    </span>
  );
}

export const fmtPoints = (x: number) => (Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.5$/, '½').replace(/^0½$/, '½'));

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="3" y="3" width="58" height="58" rx="11" fill="#f5f7fb" />
      <path d="M3 21H61M3 36H61M3 51H61" stroke="#c5cfe0" strokeWidth="2" />
      <path d="M17 3V61" stroke="#c4122f" strokeWidth="2" opacity=".55" />
      <path d="M22 33C26 37 29.5 41.5 32 47C38 33 45 22 55 12" fill="none" stroke="#c4122f" strokeWidth="6.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhereChip({ where, ms, short = false }: { where?: string; ms?: number; short?: boolean }) {
  if (!where) return null;
  const secs = ms ? ` · ${(ms / 1000).toFixed(1)} s` : '';
  if (where === 'on_device') return <span className="pill device" title="Read by Gemini Nano on this laptop"><i />{short ? 'Laptop' : 'On this laptop'}{secs}</span>;
  if (where === 'in_cloud') return <span className="pill cloud" title="Read by Gemini in the cloud (made-up sample sheets only)"><i />{short ? 'Cloud' : 'Cloud Gemini'}{secs}</span>;
  if (where === 'recorded_device') return <span className="pill device recorded" title="Gemini Nano's own reading of this made-up sheet, recorded on the author's laptop; this browser has no on-device AI"><i />{short ? 'Nano, rec.' : 'Gemini Nano · recorded'}{secs}</span>;
  if (where === 'recorded') return <span className="pill cloud" title="A cloud reading recorded earlier, used when this browser has no on-device AI"><i />{short ? 'Recorded' : 'Recorded cloud reading'}</span>;
  if (where === 'typed' || where === 'local') return <span className="pill">Typed in</span>;
  return null;
}

/** A small, consistent icon set (24-unit grid, 1.8 stroke). */
export function Icon({ name, size = 20 }: { name: 'info' | 'laptop' | 'cloud' | 'sun' | 'moon' | 'alert' | 'lock' | 'pencil' | 'pen' | 'people' | 'arrow' | 'check' | 'x' | 'camera' | 'shield'; size?: number }) {
  const p: Record<string, ReactNode> = {
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></>,
    laptop: <><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></>,
    cloud: <path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.2 9.6 4.2 4.2 0 0 0 7 18z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /></>,
    moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
    alert: <><path d="M12 3.5 2.8 19.5h18.4z" /><path d="M12 10v4.5M12 17v.5" /></>,
    lock: <><rect x="5" y="10.5" width="14" height="10" rx="1.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
    pencil: <><path d="M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5z" /><path d="M13.5 7l3 3" /></>,
    pen: <><path d="M12 19l7-7-3-3-7 7-1 4z" /><path d="M16 9l-4-4 3-2 4 4z" /></>,
    people: <><circle cx="9" cy="8" r="3.2" /><path d="M3 20c.5-3.6 3-5.5 6-5.5s5.5 1.9 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16 14.6c2.6.2 4.4 2 5 5.4" /></>,
    arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
    check: <path d="M5 12.5 10 17.5 19.5 7" />,
    x: <path d="M6 6l12 12M18 6 6 18" />,
    camera: <><path d="M4 8h3l1.5-2.5h7L17 8h3v11H4z" /><circle cx="12" cy="13.5" r="3.5" /></>,
    shield: <><path d="M12 3l7.5 3v6c0 4.5-3.2 7.8-7.5 9-4.3-1.2-7.5-4.5-7.5-9V6z" /><path d="M9 12l2.2 2.2L15.5 10" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>;
}
