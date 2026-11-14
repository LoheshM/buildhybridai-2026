// Red-pen marks: a hand-drawn ring around the score, ticks and crosses.
import type { Status } from '../marking/mark';

export function ScoreRing({ points, outOf, draw = true }: { points: number; outOf: number; draw?: boolean }) {
  const p = Number.isInteger(points) ? String(points) : points.toFixed(1).replace('.5', '½');
  return (
    <span className="score-ring" aria-label={`Score ${points} out of ${outOf}`}>
      <svg viewBox="0 0 100 60" preserveAspectRatio="none" aria-hidden="true">
        <path className={draw ? 'draw' : ''} d="M60 6 C 22 2, 4 18, 6 33 C 9 52, 52 58, 80 50 C 99 43, 98 18, 74 9 C 66 6, 54 5, 44 7" />
      </svg>
      {p}<span style={{ fontSize: '.75em' }}>/{outOf}</span>
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
      <path d="M3 13 L9 19 L21 5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="var(--pen)" />
      <path d="M15 34 L27 46 L50 17" fill="none" stroke="var(--pen-ink)" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function WhereChip({ where, ms }: { where?: string; ms?: number }) {
  if (!where) return null;
  const secs = ms ? ` · ${(ms / 1000).toFixed(1)} s` : '';
  if (where === 'on_device') return <span className="pill device"><span className="dot" />On this laptop{secs}</span>;
  if (where === 'in_cloud') return <span className="pill cloud"><span className="dot" />Cloud AI{secs}</span>;
  if (where === 'recorded') return <span className="pill cloud"><span className="dot" />Recorded cloud reading</span>;
  if (where === 'typed') return <span className="pill">Typed in</span>;
  return null;
}
