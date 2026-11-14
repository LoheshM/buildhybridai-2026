// Red-pen marks: a hand-drawn ring around the score, ticks and crosses, and the "red-pen pass"
// that marks a sample sheet photo row by row as soon as it has been read.
import type { CSSProperties } from 'react';
import type { Status } from '../marking/mark';

const RING_D = 'M60 6 C 22 2, 4 18, 6 33 C 9 52, 52 58, 80 50 C 99 43, 98 18, 74 9 C 66 6, 54 5, 44 7';
const TICK_D = 'M3.5 13.5C5.5 15 7.5 17.5 9 20C12 13.5 16 8 21.5 3.5';
const CROSS_D = ['M5 5C10 10 14 14 19 19', 'M19 5C14 10 9 15 5 19'];

export function ScoreRing({ points, outOf, draw = true, big = false, unknown = false }: { points: number; outOf: number; draw?: boolean; big?: boolean; unknown?: boolean }) {
  const p = Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.5', '½');
  return (
    <span className={`score-ring${big ? ' big' : ''}${unknown ? ' unknown' : ''}`} aria-label={unknown ? 'Score not final yet' : `Score ${points} out of ${outOf}`}>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        <path className={draw && !unknown ? 'draw' : ''} d={RING_D} />
      </svg>
      <span className="num">{unknown ? '?' : p}<span style={{ fontSize: '.75em' }}>/{outOf}</span></span>
    </span>
  );
}

export function Mark({ status }: { status: Status }) {
  if (status === 'correct') return <span className="markcell ok tick-draw" aria-label="Correct"><Tick /></span>;
  if (status === 'unsimplified') return <span className="markcell half" aria-label="Correct but not simplified">½</span>;
  if (status === 'wrong') return <span className="markcell no" aria-label="Wrong">✗</span>;
  if (status === 'blank') return <span className="markcell" aria-label="Blank">–</span>;
  return <span className="markcell half" aria-label="Unreadable">?</span>;
}

export function Tick({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={{ verticalAlign: 'middle' }}>
      <path d={TICK_D} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="12" fill="var(--sheet)" stroke="var(--line)" strokeWidth="3" />
      <path d="M10 22H54M10 34H54M10 46H54" stroke="var(--grid)" strokeWidth="2" />
      <path d="M14 33C18 37 22 42 25 48C31 34 39 23 51 13" fill="none" stroke="var(--red)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhereChip({ where, ms, short = false }: { where?: string; ms?: number; short?: boolean }) {
  if (!where) return null;
  const secs = ms ? `, ${(ms / 1000).toFixed(1)} s` : '';
  if (where === 'on_device') return <span className="pill device" title="Read by Gemini Nano on this laptop"><span className="dot" />{short ? 'Laptop' : 'On this laptop'}{secs}</span>;
  if (where === 'in_cloud') return <span className="pill cloud" title="Read by Gemini in the cloud (sample sheets only)"><span className="dot" />{short ? 'Cloud' : 'Cloud AI'}{secs}</span>;
  if (where === 'recorded') return <span className="pill cloud" title="A cloud reading recorded earlier, used when this laptop has no on-device AI"><span className="dot" />{short ? 'Recorded' : 'Recorded cloud reading'}</span>;
  if (where === 'typed' || where === 'local') return <span className="pill">Typed in</span>;
  return null;
}

/*
 * Row geometry of the generated sample photos (tools/samples): answer row i is centred at about
 * 19.6% + i * 7.37% of the photo height; the marks go in the right-hand margin.
 */
const ROW0 = 19.6, STEP = 7.37, COL = 66;
export interface PenMark { status: Status; flag?: boolean }

export function PenPass({ marks, play, note, delayMs = 0 }: { marks: PenMark[]; play: boolean; note?: { row: number; text: string }; delayMs?: number }) {
  return (
    <div className={`pen-pass${play ? ' play' : ''}`} aria-hidden="true" style={{ '--d': `${delayMs}ms`, '--n': marks.length } as CSSProperties}>
      {marks.map((m, i) => {
        const pos = { top: `${ROW0 + i * STEP}%`, '--i': i } as CSSProperties;
        return (
          <span key={i}>
            {m.flag && <span className="hl-swipe" style={pos} />}
            {(m.status === 'correct' || m.status === 'wrong') && (
              <svg viewBox="0 0 24 24" style={{ ...pos, left: `${COL}%` }}>
                {m.status === 'correct' ? <path pathLength={1} d={TICK_D} /> : CROSS_D.map((d) => <path key={d} pathLength={1} d={d} />)}
              </svg>
            )}
          </span>
        );
      })}
      {note && <span className="margin-note" style={{ top: `${ROW0 + note.row * STEP + 3}%`, left: '47%' }}>{note.text}</span>}
    </div>
  );
}
