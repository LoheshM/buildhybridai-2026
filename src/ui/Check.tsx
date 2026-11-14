import { useCallback, useEffect, useMemo, useState } from 'react';
import { go, href } from '../app/router';
import { FLAG_TEXT, scoreSheet, type Marked } from '../marking/mark';
import { MISCONCEPTIONS } from '../marking/misconceptions';
import { applyCorrection, needsCheck, openFlags } from '../marking/pipeline';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { useLoad } from './hooks';
import { Mark, ScoreRing, WhereChip } from './Marks';

export function Check({ quizId, sheetId }: { quizId: string; sheetId?: string }) {
  const [ctx] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    return { quiz, cls, sheets: quiz ? await store.sheets(quiz.id) : [] };
  }, [quizId]);
  const [sheets, setSheets] = useState<SheetRec[]>([]);
  useEffect(() => { if (ctx) setSheets(ctx.sheets.filter((s) => s.status === 'read' || s.status === 'checked')); }, [ctx]);
  const ordered = useMemo(() => [...sheets].sort((a, b) => Number(sheetNeeds(b)) - Number(sheetNeeds(a)) || a.createdAt - b.createdAt), [sheets]);
  const current = sheets.find((s) => s.id === sheetId) ?? ordered[0];

  if (!ctx) return <p className="muted">Loading…</p>;
  if (!ctx.quiz || !ctx.cls) return <p>This quiz no longer exists. <a href={href.home()}>Back to classes</a></p>;
  if (!current) return (
    <div className="sheet"><h1>Nothing to check yet</h1><p className="muted">Read some sheets first.</p><a className="btn primary" href={href.scan(quizId)}>Go to sheets</a></div>
  );
  const remaining = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const save = async (s: SheetRec) => {
    const done = !s.marks.some(needsCheck) && !!s.studentId;
    const next = { ...s, status: done ? 'checked' as const : 'read' as const, checkedAt: done ? Date.now() : undefined };
    await store.putSheet(next);
    setSheets((xs) => xs.map((x) => (x.id === next.id ? next : x)));
  };
  const nextFlagged = () => {
    const i = ordered.findIndex((s) => s.id === current.id);
    const n = [...ordered.slice(i + 1), ...ordered.slice(0, i)].find(sheetNeeds);
    if (n) go(href.check(quizId, n.id)); else go(href.results(quizId));
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <div><span className="muted small">{ctx.cls.name}, {ctx.quiz.title}</span><h1 style={{ margin: 0 }}>Check answers</h1></div>
        <div className="row">
          <span className="muted" role="status">{remaining ? `${remaining} answer${remaining === 1 ? '' : 's'} waiting for you` : 'Everything checked'}</span>
          <a className="btn primary" href={href.results(quizId)}>Results</a>
        </div>
      </div>
      <div className="check">
        <nav className="sheetlist sheet" style={{ padding: 8 }} aria-label="Sheets">
          {ordered.map((s) => {
            const st = ctx.cls!.roster.find((r) => r.id === s.studentId);
            const n = s.marks.filter(needsCheck).length + (s.studentId ? 0 : 1);
            return (
              <button key={s.id} aria-current={s.id === current.id} onClick={() => go(href.check(quizId, s.id))}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st?.name ?? `"${s.readName || 'no name'}"`}</span>
                {n > 0 ? <span className="flag">{n}</span> : <span style={{ color: 'var(--green)' }}>✓</span>}
              </button>
            );
          })}
        </nav>
        <Viewer sheet={current} />
        <SheetPanel key={current.id} sheet={current} cls={ctx.cls} quiz={ctx.quiz} sheets={sheets} onChange={save} onNext={nextFlagged} />
      </div>
    </>
  );
}

const sheetNeeds = (s: SheetRec) => s.marks.some(needsCheck) || !s.studentId;

function Viewer({ sheet }: { sheet: SheetRec }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    if (sheet.sampleId) { setUrl(`/samples/${sheet.sampleId}.jpg`); return; }
    if (!sheet.imageId) { setUrl(null); return; }
    let u: string | null = null;
    store.image(sheet.imageId).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [sheet.id, sheet.imageId, sheet.sampleId]);
  return (
    <div className={`viewer ${zoom ? 'zoomed' : ''}`}>
      <div className="zoom mark-sheet">
        {url ? <img src={url} alt="Photo of this student's worksheet" onClick={() => setZoom(!zoom)} /> : <p className="muted" style={{ padding: 20 }}>{sheet.source === 'typed' ? 'Typed-in answers have no photo.' : 'The photo was deleted after checking.'}</p>}
      </div>
      <p className="muted small" style={{ marginTop: 6 }}>Click the photo to zoom.</p>
    </div>
  );
}

function SheetPanel({ sheet, cls, quiz, sheets, onChange, onNext }: { sheet: SheetRec; cls: ClassRec; quiz: QuizRec; sheets: SheetRec[]; onChange: (s: SheetRec) => void; onNext: () => void }) {
  const firstFlag = Math.max(0, sheet.marks.findIndex(needsCheck));
  const [focus, setFocus] = useState(firstFlag);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const score = scoreSheet(sheet.marks, quiz.unsimplifiedCredit);
  const taken = new Set(sheets.filter((s) => s.id !== sheet.id).map((s) => s.studentId));

  const setMark = useCallback((i: number, m: Marked) => onChange({ ...sheet, marks: sheet.marks.map((x, j) => (j === i ? m : x)) }), [sheet, onChange]);
  const accept = useCallback((i: number) => setMark(i, { ...sheet.marks[i], checked: true }), [sheet, setMark]);
  const correct = useCallback((i: number, text: string) => setMark(i, applyCorrection(quiz.keys[i], sheet.marks[i], text)), [quiz, sheet, setMark]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
      const m = sheet.marks[focus];
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(sheet.marks.length - 1, f + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (e.key === 'Enter' && m) { e.preventDefault(); accept(focus); const n = sheet.marks.findIndex((x, j) => j > focus && needsCheck(x)); if (n >= 0) setFocus(n); }
      else if (/^[1-3]$/.test(e.key) && m?.suggestions[Number(e.key) - 1]) { e.preventDefault(); correct(focus, m.suggestions[Number(e.key) - 1]); }
      else if (e.key === 'e' && m) { e.preventDefault(); document.getElementById(`ans-${focus}`)?.focus(); }
      else if (e.key === 'n') { e.preventDefault(); onNext(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [focus, sheet, accept, correct, onNext]);

  return (
    <section className="sheet" aria-label="Answers on this sheet">
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <label className="field" style={{ flex: 1, minWidth: 200 }}>Student
          <select data-student value={sheet.studentId ?? ''} onChange={(e) => onChange({ ...sheet, studentId: e.target.value || null, nameConfident: true })}
            style={{ borderColor: sheet.studentId ? undefined : 'var(--red)' }}>
            <option value="">Pick a student…</option>
            {cls.roster.map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id)}>{r.name}{taken.has(r.id) ? ' (already has a sheet)' : ''}</option>)}
          </select>
          <span className="hint">Read on the sheet as "{sheet.readName || 'nothing'}"{sheet.studentId && !sheet.nameConfident ? '. Please confirm.' : ''}</span>
        </label>
        <div style={{ position: 'relative', minWidth: 90, minHeight: 56 }}>{score.unreadable === 0 && <ScoreRing points={score.points} outOf={score.outOf} draw={false} />}</div>
      </div>
      <div className="row small" style={{ margin: '4px 0 8px' }}><WhereChip where={sheet.where} ms={sheet.ms} />{sheet.rereadQs?.length ? <span className="muted">Second read of Q{sheet.rereadQs.join(', Q')}</span> : null}</div>
      <table className="answers">
        <thead><tr><th>Q</th><th>Question</th><th>Read as</th><th>Mark</th><th>What to look at</th></tr></thead>
        <tbody>
          {sheet.marks.map((m, i) => {
            const k = quiz.keys[i];
            const need = needsCheck(m);
            return (
              <tr key={m.q} className={`${need ? 'needs' : ''} ${focus === i ? 'focus' : ''}`} onClick={() => setFocus(i)}>
                <td>{m.q}</td>
                <td className="small">{k?.prompt} = <b>{k?.answer}</b></td>
                <td>
                  <input id={`ans-${i}`} data-student aria-label={`Answer to question ${m.q}`} spellCheck={false} autoComplete="off"
                    value={edits[i] ?? m.read} onChange={(e) => setEdits({ ...edits, [i]: e.target.value })}
                    onBlur={() => { if (edits[i] !== undefined && edits[i] !== m.read) correct(i, edits[i]); setEdits((x) => { const y = { ...x }; delete y[i]; return y; }); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                  {m.crossedOut && <div className="small muted">crossed out: <s>{m.crossedOut}</s></div>}
                </td>
                <td><Mark status={m.status} /></td>
                <td>
                  {openFlags(m).map((f) => <span key={f} className="flag">{FLAG_TEXT[f]}</span>)}
                  {m.misconception && <div className="mis">{MISCONCEPTIONS[m.misconception].label}</div>}
                  {m.flags.includes('teacher_changed') && <div className="mis">Changed by you{m.suggestions[0] ? ` (read as "${m.suggestions[0]}")` : ''}</div>}
                  {need && (
                    <div className="row" style={{ gap: 6, marginTop: 4 }}>
                      {m.suggestions.slice(0, 3).map((s, j) => <button key={s} className="btn small sugg" onClick={() => correct(i, s)} title={`Key ${j + 1}`}>It says {s}</button>)}
                      <button className="btn small" onClick={() => accept(i)}>Read is right</button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="muted small"><kbd>J</kbd>/<kbd>K</kbd> move, <kbd>Enter</kbd> read is right, <kbd>1</kbd>–<kbd>3</kbd> pick a suggestion, <kbd>E</kbd> edit, <kbd>N</kbd> next sheet</span>
        <button className="btn primary" onClick={onNext}>Next sheet to check</button>
      </div>
    </section>
  );
}
