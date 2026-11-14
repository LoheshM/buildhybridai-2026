import { useMemo } from 'react';
import { href } from '../app/router';
import { scoreSheet } from '../marking/mark';
import { MISCONCEPTIONS, type MisconceptionId } from '../marking/misconceptions';
import { needsCheck } from '../marking/pipeline';
import { MIN_SHEETS } from '../privacy/aggregate';
import { csvCell } from '../privacy/templates';
import { store, type SheetRec } from '../store/db';
import { useLoad, useToast } from './hooks';

export function Results({ quizId }: { quizId: string }) {
  const [ctx, reload] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    return { quiz, cls, sheets: quiz ? (await store.sheets(quiz.id)).filter((s) => s.status === 'read' || s.status === 'checked') : [] };
  }, [quizId]);
  const [toast, setToast] = useToast();
  const view = useMemo(() => (ctx?.quiz && ctx.cls ? summarise(ctx.sheets, ctx.quiz.keys.length, ctx.quiz.unsimplifiedCredit) : null), [ctx]);
  if (!ctx || !view) return <p className="muted">Loading…</p>;
  const { quiz, cls, sheets } = ctx;
  if (!quiz || !cls) return <p>This quiz no longer exists.</p>;
  const name = (s: SheetRec) => cls.roster.find((r) => r.id === s.studentId)?.name ?? `"${s.readName || 'unknown'}"`;
  if (!sheets.length) return <div className="sheet"><h1>No results yet</h1><p className="muted">Read some sheets first.</p><a className="btn primary" href={href.scan(quizId)}>Go to sheets</a></div>;

  const exportCsv = () => {
    const head = ['Student', ...quiz.keys.map((k) => `Q${k.q}`), 'Score', 'Out of'];
    const lines = [head, ...sheets.map((s) => { const sc = scoreSheet(s.marks, quiz.unsimplifiedCredit); return [name(s), ...s.marks.map((m) => m.read), sc.points, sc.outOf]; })];
    const blob = new Blob([lines.map((l) => l.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${quiz.title.replace(/[^\w -]/g, '')} marks.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><span className="muted small">{cls.name}</span><h1 style={{ margin: 0 }}>{quiz.title}: results</h1></div>
        <div className="row noprint">
          <a className="btn" href={href.check(quizId)}>Check answers</a>
          <a className={`btn ${sheets.length >= MIN_SHEETS ? 'primary' : ''}`} href={href.reteach(quizId)} aria-disabled={sheets.length < MIN_SHEETS}>Plan tomorrow's lesson</a>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><b>{sheets.length}</b><span>sheets marked</span></div>
        <div className="stat"><b>{view.avg.toFixed(1)}/{quiz.keys.length}</b><span>class average</span></div>
        <div className="stat"><b>{view.flagsLeft}</b><span>answers still to check</span></div>
        <div className="stat"><b>{view.deviceMins}</b><span>reading on this laptop</span></div>
      </div>
      {view.flagsLeft > 0 && <p className="callout">Some answers are still flagged. The results below include Tickmark's best reading for them; <a href={href.check(quizId)}>check them</a> before sharing marks.</p>}

      <section className="section">
        <h2>Mistakes to reteach</h2>
        <p className="muted">Tickmark recomputes each wrong answer with common wrong methods. When one matches, the mistake gets a name.</p>
        <div className="groups">
          {view.groups.map((g) => (
            <div key={g.id} className={`sheet group ${g.id === 'secure' ? 'secure' : ''}`}>
              <h3>{g.label}</h3>
              <p className="muted small">{g.teacher}</p>
              <p><b>{g.students.length} student{g.students.length === 1 ? '' : 's'}</b>{g.qs.length ? `, on Q${g.qs.join(', Q')}` : ''}</p>
              <details><summary className="small">Who</summary><p className="small">{g.students.map((s) => name(s)).join(', ')}</p></details>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Every answer</h2>
        <div style={{ overflowX: 'auto' }} className="sheet">
          <table className="heat">
            <thead><tr><th className="who">Student</th>{quiz.keys.map((k) => <th key={k.q} title={`${k.prompt} = ${k.answer}`}>Q{k.q}</th>)}<th>Score</th></tr></thead>
            <tbody>
              {sheets.map((s) => {
                const sc = scoreSheet(s.marks, quiz.unsimplifiedCredit);
                return (
                  <tr key={s.id}>
                    <th className="who"><a href={href.check(quizId, s.id)}>{name(s)}</a></th>
                    {s.marks.map((m) => (
                      <td key={m.q} className={{ correct: 'c', unsimplified: 'u', wrong: 'w', blank: 'b', unreadable: 'x' }[m.status]}
                        title={`Read as "${m.read}"${m.misconception ? `: ${MISCONCEPTIONS[m.misconception].label}` : ''}${needsCheck(m) ? ' (still to check)' : ''}`}>
                        {{ correct: '✓', unsimplified: '½', wrong: '✗', blank: '–', unreadable: '?' }[m.status]}
                      </td>
                    ))}
                    <td style={{ font: '700 1rem var(--ui)', width: 'auto', padding: '0 8px' }}>{sc.points}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><td>Correct</td>{view.perQ.map((p, i) => <td key={i}>{Math.round(p * 100)}%</td>)}<td /></tr></tfoot>
          </table>
        </div>
      </section>

      <div className="row section noprint">
        <button className="btn" onClick={exportCsv}>Download marks (CSV)</button>
        <button className="btn" onClick={() => window.print()}>Print</button>
        {!cls.sample && <button className="btn danger" onClick={async () => { await store.deletePhotos(quizId); setToast('Photos deleted from this laptop. Marks are kept.'); reload(); }}>Delete the photos, keep the marks</button>}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

function summarise(sheets: SheetRec[], n: number, credit: number) {
  const avg = sheets.reduce((a, s) => a + scoreSheet(s.marks, credit).points, 0) / Math.max(1, sheets.length);
  const perQ = Array.from({ length: n }, (_, i) => sheets.filter((s) => s.marks[i]?.status === 'correct' || s.marks[i]?.status === 'unsimplified').length / Math.max(1, sheets.length));
  const flagsLeft = sheets.reduce((a, s) => a + s.marks.filter(needsCheck).length, 0);
  const ms = sheets.filter((s) => s.where === 'on_device').reduce((a, s) => a + (s.ms ?? 0) + (s.rereadMs ?? 0), 0);
  const deviceMins = ms ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : 'none';
  const map = new Map<string, { students: Set<SheetRec>; qs: Set<number> }>();
  for (const s of sheets) for (const m of s.marks) {
    if (m.status !== 'wrong') continue;
    const id = m.misconception ?? 'other';
    const g = map.get(id) ?? { students: new Set(), qs: new Set() };
    g.students.add(s); g.qs.add(m.q); map.set(id, g);
  }
  const groups = [...map.entries()].map(([id, g]) => ({
    id,
    label: id === 'other' ? 'Other wrong answers' : MISCONCEPTIONS[id as MisconceptionId].label,
    teacher: id === 'other' ? 'No common wrong method matched. Worth a look at the working.' : MISCONCEPTIONS[id as MisconceptionId].teacher,
    students: [...g.students], qs: [...g.qs].sort((a, b) => a - b),
  })).sort((a, b) => b.students.length - a.students.length);
  const secure = sheets.filter((s) => s.marks.every((m) => m.status === 'correct'));
  if (secure.length) groups.push({ id: 'secure', label: 'All correct', teacher: 'Every answer right and simplified.', students: secure, qs: [] });
  return { avg, perQ, flagsLeft, deviceMins, groups };
}
