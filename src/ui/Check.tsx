import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go, href } from '../app/router';
import { onSheetChanged, runState } from '../app/runner';
import { FLAG_TEXT, scoreSheet, type Marked } from '../marking/mark';
import { MISCONCEPTIONS } from '../marking/misconceptions';
import { applyCorrection, markWrongByTeacher, needsCheck, openFlags } from '../marking/pipeline';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { useLoad } from './hooks';
import { Mark, ScoreRing, Tick, WhereChip } from './Marks';
import { Steps } from './Steps';

const nameNeedsCheck = (s: SheetRec) => !s.studentId || !s.nameConfident;
const sheetNeeds = (s: SheetRec) => s.marks.some(needsCheck) || nameNeedsCheck(s);
const isRead = (s: SheetRec) => s.status === 'read' || s.status === 'checked';

export function Check({ quizId, sheetId }: { quizId: string; sheetId?: string }) {
  const [ctx] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    return { quiz, cls, sheets: quiz ? await store.sheets(quiz.id) : [] };
  }, [quizId]);
  const [sheets, setSheets] = useState<SheetRec[]>([]);
  const [order, setOrder] = useState<string[]>([]); // fixed when the page loads, so rows don't jump while checking
  useEffect(() => {
    if (!ctx) return;
    const read = ctx.sheets.filter(isRead);
    setSheets(read);
    setOrder([...read].sort((a, b) => Number(sheetNeeds(b)) - Number(sheetNeeds(a)) || a.createdAt - b.createdAt).map((s) => s.id));
  }, [ctx]);
  // Sheets the runner finishes while the teacher is checking are appended, not re-sorted.
  useEffect(() => onSheetChanged((s) => {
    if (s.quizId !== quizId || !isRead(s)) return;
    setSheets((xs) => (xs.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [...xs, s]));
    setOrder((o) => (o.includes(s.id) ? o : [...o, s.id]));
  }), [quizId]);
  const ordered = useMemo(() => order.map((id) => sheets.find((s) => s.id === id)).filter((s): s is SheetRec => !!s), [order, sheets]);
  const current = sheets.find((s) => s.id === sheetId) ?? ordered.find(sheetNeeds) ?? ordered[0];
  const stillReading = runState().running && runState().quizId === quizId ? Math.max(0, runState().total - runState().done) : 0;

  if (!ctx) return <p className="muted">Loading…</p>;
  if (!ctx.quiz || !ctx.cls) return <p>This quiz no longer exists. <a href={href.home()}>Back to classes</a></p>;
  if (!current) return (
    <div className="sheet"><h1>Nothing to check yet</h1><p className="muted">Read some sheets first.</p><a className="btn primary" href={href.scan(quizId)}>Go to sheets</a></div>
  );
  const answersLeft = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const namesLeft = sheets.filter(nameNeedsCheck).length;
  const save = (s: SheetRec) => {
    const done = !s.marks.some(needsCheck) && !nameNeedsCheck(s);
    const next = { ...s, status: done ? 'checked' as const : 'read' as const, checkedAt: done ? Date.now() : undefined };
    setSheets((xs) => xs.map((x) => (x.id === next.id ? next : x))); // update first so quick edits build on it
    store.putSheet(next).catch((e) => window.dispatchEvent(new CustomEvent('tickmark:save-failed', { detail: (e as Error).message })));
  };
  const remove = async (s: SheetRec) => {
    if (!window.confirm('Remove this sheet and its photo from the quiz? This cannot be undone.')) return;
    await store.deleteSheet(s);
    setSheets((xs) => xs.filter((x) => x.id !== s.id));
    setOrder((o) => o.filter((id) => id !== s.id));
    go(href.check(quizId));
  };
  const nextFlagged = () => {
    const i = ordered.findIndex((s) => s.id === current.id);
    const n = [...ordered.slice(i + 1), ...ordered.slice(0, i)].find(sheetNeeds);
    if (n) go(href.check(quizId, n.id)); else go(href.results(quizId));
  };
  const parts = [answersLeft ? `${answersLeft} answer${answersLeft === 1 ? '' : 's'}` : '', namesLeft ? `${namesLeft} name${namesLeft === 1 ? '' : 's'}` : ''].filter(Boolean);

  return (
    <>
      <Steps quizId={quizId} at="check" className={ctx.cls.name} />
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ margin: 0 }}>Check answers</h1>
        <div className="row">
          <span className="muted" role="status">{parts.length ? `${parts.join(' and ')} waiting for you` : 'Everything checked'}{stillReading ? `. ${stillReading} more sheet${stillReading === 1 ? ' is' : 's are'} still being read.` : ''}</span>
          <a className={`btn ${parts.length ? '' : 'primary'}`} href={href.results(quizId)}>{parts.length ? 'Results' : 'See results'}</a>
        </div>
      </div>
      <div className="check">
        <nav className="sheetlist sheet" style={{ padding: 8 }} aria-label="Sheets">
          {ordered.map((s) => {
            const st = ctx.cls!.roster.find((r) => r.id === s.studentId);
            const n = s.marks.filter(needsCheck).length + (nameNeedsCheck(s) ? 1 : 0);
            return (
              <button key={s.id} aria-current={s.id === current.id} onClick={() => go(href.check(quizId, s.id))}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st?.name ?? `"${s.readName || 'no name'}"`}</span>
                {n > 0 ? <span className="flag">{n}</span> : <span style={{ color: 'var(--green)' }} aria-label="checked"><Tick size={16} /></span>}
              </button>
            );
          })}
        </nav>
        <Viewer sheet={current} />
        <SheetPanel key={current.id} sheet={current} cls={ctx.cls} quiz={ctx.quiz} sheets={sheets} onChange={save} onNext={nextFlagged} onRemove={remove} />
      </div>
    </>
  );
}

function Viewer({ sheet }: { sheet: SheetRec }) {
  const [url, setUrl] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);
  useEffect(() => {
    let alive = true, u: string | null = null;
    setUrl(null);
    if (sheet.sampleId) { setUrl(`/samples/${sheet.sampleId}.jpg`); return; }
    if (!sheet.imageId) return;
    store.image(sheet.imageId).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [sheet.id, sheet.imageId, sheet.sampleId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'z' && !skipKey(e)) setZoom((z) => !z); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className={`viewer ${zoom ? 'zoomed' : ''}`}>
      <div className="zoom mark-sheet">
        {url ? <img src={url} alt="Photo of this student's worksheet" onClick={() => setZoom(!zoom)} /> : <p className="muted" style={{ padding: 20 }}>{sheet.source === 'typed' ? 'Typed-in answers have no photo.' : sheet.imageId || sheet.sampleId ? 'Loading photo…' : 'The photo was deleted after checking.'}</p>}
      </div>
      <button className="btn small" style={{ marginTop: 6 }} onClick={() => setZoom(!zoom)}>{zoom ? 'Fit the photo' : 'Zoom in'} <kbd>Z</kbd></button>
    </div>
  );
}

/** Keyboard shortcuts never fire while typing or when a control has focus. */
function skipKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(t.tagName) || t.isContentEditable;
}

function SheetPanel({ sheet, cls, quiz, sheets, onChange, onNext, onRemove }: { sheet: SheetRec; cls: ClassRec; quiz: QuizRec; sheets: SheetRec[]; onChange: (s: SheetRec) => void; onNext: () => void; onRemove: (s: SheetRec) => void }) {
  const firstFlag = Math.max(0, sheet.marks.findIndex(needsCheck));
  const [focus, setFocus] = useState(firstFlag);
  const [edits, setEdits] = useState<Record<number, string>>({});
  const rows = useRef<(HTMLTableRowElement | null)[]>([]);
  const score = scoreSheet(sheet.marks, quiz.unsimplifiedCredit);
  const taken = new Set(sheets.filter((s) => s.id !== sheet.id).map((s) => s.studentId));

  const latest = useRef(sheet);
  latest.current = sheet;
  const setMark = useCallback((i: number, m: Marked) => { const cur = latest.current; const next = { ...cur, marks: cur.marks.map((x, j) => (j === i ? m : x)) }; latest.current = next; onChange(next); }, [onChange]);
  const accept = useCallback((i: number) => { const m = latest.current.marks[i]; if (m.status === 'unreadable') return; setMark(i, { ...m, checked: true }); }, [setMark]);
  const correct = useCallback((i: number, text: string) => setMark(i, applyCorrection(quiz.keys[i], latest.current.marks[i], text)), [quiz, setMark]);
  useEffect(() => { rows.current[focus]?.scrollIntoView({ block: 'nearest' }); }, [focus]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (skipKey(e)) return;
      const m = sheet.marks[focus];
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(sheet.marks.length - 1, f + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (e.key === 'Enter' && m && m.status !== 'unreadable') { e.preventDefault(); accept(focus); const n = sheet.marks.findIndex((x, j) => j > focus && needsCheck(x)); if (n >= 0) setFocus(n); }
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
          <select data-student value={sheet.studentId ?? ''} onChange={(e) => { onChange({ ...sheet, studentId: e.target.value || null, nameConfident: !!e.target.value }); e.currentTarget.blur(); }}
            style={nameNeedsCheck(sheet) ? { borderColor: 'var(--hl)', boxShadow: '0 0 0 3px var(--hl-soft)' } : undefined}>
            <option value="">Pick a student…</option>
            {cls.roster.map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id)}>{r.name}{taken.has(r.id) ? ' (already has a sheet)' : ''}</option>)}
          </select>
          <span className="hint">Read on the sheet as "{sheet.readName || 'nothing'}".</span>
        </label>
        <div style={{ position: 'relative', minWidth: 90, minHeight: 56 }}><ScoreRing points={score.points} outOf={score.outOf} draw={false} unknown={score.unreadable > 0} /></div>
      </div>
      {sheet.studentId && !sheet.nameConfident && (
        <div className="row callout small" style={{ margin: '8px 0', justifyContent: 'space-between' }}>
          <span>Is this {cls.roster.find((r) => r.id === sheet.studentId)?.name}'s sheet? The name didn't match the class list exactly.</span>
          <button className="btn small primary" onClick={() => onChange({ ...sheet, nameConfident: true })}>Name is right</button>
        </div>
      )}
      <div className="row small" style={{ margin: '4px 0 8px' }}><WhereChip where={sheet.source === 'typed' ? 'typed' : sheet.where} ms={sheet.ms} />{sheet.rereadQs?.length ? <span className="muted">Read twice: Q{sheet.rereadQs.join(', Q')}</span> : null}</div>
      <p className="muted small keys"><kbd>J</kbd>/<kbd>K</kbd> move, <kbd>Enter</kbd> read is right, <kbd>1</kbd>–<kbd>3</kbd> pick a reading, <kbd>E</kbd> edit, <kbd>Z</kbd> zoom, <kbd>N</kbd> next sheet</p>
      <table className="answers">
        <thead><tr><th>Q</th><th>Question</th><th>Read as</th><th>Mark</th></tr></thead>
        <tbody>
          {sheet.marks.map((m, i) => {
            const k = quiz.keys[i];
            const need = needsCheck(m);
            const sub = need || !!m.misconception || m.flags.includes('teacher_changed');
            const cls = `${need ? 'needs' : ''} ${focus === i ? 'focus' : ''}`;
            return (
              <Fragment key={m.q}>
                <tr ref={(el) => { rows.current[i] = el; }} className={cls} onClick={() => setFocus(i)}>
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
                </tr>
                {sub && (
                  <tr className={`sub ${cls}`} onClick={() => setFocus(i)}>
                    <td />
                    <td colSpan={3}>
                      {openFlags(m).map((f) => <span key={f} className="flag">{FLAG_TEXT[f]}</span>)}
                      {m.status === 'unreadable' && !m.checked && openFlags(m).length === 0 && <span className="flag">{FLAG_TEXT.unreadable}</span>}
                      {m.misconception && <span className="mis">{MISCONCEPTIONS[m.misconception].label}. </span>}
                      {m.flags.includes('teacher_changed') && <span className="mis">Changed by you{m.suggestions[0] ? ` (read as "${m.suggestions[0]}")` : ''}.</span>}
                      {need && (
                        <div className="row" style={{ gap: 6, marginTop: 4 }}>
                          {m.suggestions.slice(0, 3).map((s, j) => <button key={s} className="btn small sugg" onClick={() => correct(i, s)}>It says {s} <kbd>{j + 1}</kbd></button>)}
                          {m.status === 'unreadable'
                            ? <button className="btn small" onClick={() => setMark(i, markWrongByTeacher(m))}>Mark wrong</button>
                            : <button className="btn small" onClick={() => accept(i)}>Read is right <kbd>Enter</kbd></button>}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <div className="row next-bar" style={{ justifyContent: 'space-between', marginTop: 12 }}>
        <span className="muted small">Sheet {Math.max(1, sheets.findIndex((x) => x.id === sheet.id) + 1)} of {sheets.length}</span>
        <div className="row">
          <button className="btn small ghost danger" onClick={() => onRemove(sheet)}>Remove sheet</button>
          <button className="btn primary" onClick={onNext}>Next sheet to check <kbd>N</kbd></button>
        </div>
      </div>
    </section>
  );
}
