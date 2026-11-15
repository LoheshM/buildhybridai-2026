// Check: turn pencil into ink. By question (every pupil's answer to one question, like marking a
// pile) or by sheet (one pupil's whole sheet beside the photo). One key per decision.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go, href } from '../app/router';
import { onSheetChanged, runState } from '../app/runner';
import { FLAG_TEXT, outOfFor, scoreSheet, typeOf, type Marked, type QuestionKey } from '../marking/mark';
import { mistakeLabel } from '../marking/mistakes';
import { decideOpen } from '../marking/open';
import { applyCorrection, markWrongByTeacher, needsCheck, openFlags } from '../marking/pipeline';
import { isOpen, keyPoints, parseRubric, QTYPES } from '../marking/qtypes';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { useLoad } from './hooks';
import { usePhoto } from './Scan';
import { Notice } from './App';
import { AnswerMark, Icon, fmtPoints, ScoreRing, WhereChip, useInkMoment } from './Marks';

const isRead = (s: SheetRec) => s.status === 'read' || s.status === 'checked';
const nameNeedsCheck = (s: SheetRec) => !s.studentId || !s.nameConfident;
const sheetNeeds = (s: SheetRec) => s.marks.some(needsCheck) || nameNeedsCheck(s);

/** Keyboard shortcuts never fire while typing or when a control has focus. */
function skipKey(e: KeyboardEvent) {
  const t = e.target as HTMLElement;
  return e.ctrlKey || e.metaKey || e.altKey || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON', 'A'].includes(t.tagName) || t.isContentEditable;
}

export function Check({ quizId, sheetId, q }: { quizId: string; sheetId?: string; q?: number }) {
  const [ctx] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    return { quiz, cls, sheets: quiz ? (await store.sheets(quiz.id)).filter(isRead) : [] };
  }, [quizId]);
  const [sheets, setSheets] = useState<SheetRec[]>([]);
  useEffect(() => { if (ctx) setSheets(ctx.sheets); }, [ctx]);
  // sheets the runner finishes while the teacher is checking join at the end, in place
  useEffect(() => onSheetChanged((s) => {
    if (s.quizId !== quizId || !isRead(s)) return;
    setSheets((xs) => (xs.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [...xs, s]));
  }), [quizId]);

  const save = useCallback((s: SheetRec) => {
    const done = !sheetNeeds(s);
    const next = { ...s, status: done ? 'checked' as const : 'read' as const, checkedAt: done ? Date.now() : undefined };
    setSheets((xs) => xs.map((x) => (x.id === next.id ? next : x)));
    store.putSheet(next).then(() => dispatchEvent(new Event('tickmark:marks-changed'))).catch((e) => dispatchEvent(new CustomEvent('tickmark:save-failed', { detail: (e as Error).message })));
  }, []);

  if (!ctx) return <p className="muted">Loading answers…</p>;
  if (!ctx.quiz || !ctx.cls) return <p>This quiz no longer exists. <a href={href.home()}>Back to classes</a></p>;
  if (!sheets.length) return (
    <div className="panel"><h2>Nothing to check yet</h2><p className="muted">Read some sheets first.</p><a className="btn primary" href={href.scan(quizId)}>Go to the sheets</a></div>
  );
  const { quiz, cls } = ctx;
  const bySheet = !!sheetId;
  const stillReading = runState().running && runState().quizId === quizId ? Math.max(0, runState().total - runState().done) : 0;
  const answersLeft = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const namesLeft = sheets.filter(nameNeedsCheck).length;
  const firstQ = quiz.keys.find((k) => sheets.some((s) => { const m = s.marks.find((x) => x.q === k.q); return m && needsCheck(m); }))?.q ?? 1;

  return (
    <>
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div className="tabs" role="tablist" aria-label="Check by">
          <button role="tab" aria-selected={!bySheet} onClick={() => go(href.checkQ(quizId, q ?? firstQ))}>By question</button>
          <button role="tab" aria-selected={bySheet} onClick={() => go(href.check(quizId, (sheets.find(sheetNeeds) ?? sheets[0]).id))}>By sheet</button>
        </div>
        <span className="small muted" role="status">
          {answersLeft || namesLeft ? `${[answersLeft ? `${answersLeft} answer${answersLeft === 1 ? '' : 's'}` : '', namesLeft ? `${namesLeft} name${namesLeft === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ')} waiting for you` : 'Everything is decided.'}
          {stillReading ? ` ${stillReading} more sheet${stillReading === 1 ? ' is' : 's are'} still being read.` : ''}
        </span>
      </div>
      {bySheet
        ? <BySheet quiz={quiz} cls={cls} sheets={sheets} sheetId={sheetId!} save={save} />
        : <ByQuestion quiz={quiz} cls={cls} sheets={sheets} q={q ?? firstQ} save={save} />}
    </>
  );
}

// ------------------------------------------------------------------ by question
function ByQuestion({ quiz, cls, sheets, q, save }: { quiz: QuizRec; cls: ClassRec; sheets: SheetRec[]; q: number; save: (s: SheetRec) => void }) {
  const key = quiz.keys.find((k) => k.q === q) ?? quiz.keys[0];
  const type = typeOf(key);
  const nameOf = (s: SheetRec) => cls.roster.find((r) => r.id === s.studentId)?.name ?? (s.readName ? `"${s.readName}"` : 'Name not read');
  // order fixed when the question opens: waiting first, then by name, so rows don't jump while marking
  const [order, setOrder] = useState<string[]>([]);
  useEffect(() => {
    setOrder([...sheets].sort((a, b) => {
      const na = needsCheck(a.marks.find((m) => m.q === key.q)!) ? 0 : 1, nb = needsCheck(b.marks.find((m) => m.q === key.q)!) ? 0 : 1;
      return na - nb || nameOf(a).localeCompare(nameOf(b));
    }).map((s) => s.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key.q, sheets.length]);
  const rows = order.map((id) => sheets.find((s) => s.id === id)).filter((s): s is SheetRec => !!s);
  const [focus, setFocus] = useState(0);
  useEffect(() => setFocus(0), [key.q]);
  const waitingIn = (k: QuestionKey) => sheets.filter((s) => { const m = s.marks.find((x) => x.q === k.q); return m && needsCheck(m); }).length;
  const nextQ = () => {
    const i = quiz.keys.findIndex((k) => k.q === key.q);
    const n = [...quiz.keys.slice(i + 1), ...quiz.keys.slice(0, i)].find((k) => waitingIn(k) > 0);
    go(n ? href.checkQ(quiz.id, n.q) : href.results(quiz.id));
  };
  const setMark = (s: SheetRec, m: Marked) => save({ ...s, marks: s.marks.map((x) => (x.q === m.q ? m : x)) });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (skipKey(e)) return;
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(rows.length - 1, f + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (e.key === 'n') { e.preventDefault(); nextQ(); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const waiting = waitingIn(key);
  return (
    <div className="check-layout">
      <nav className="qnav" aria-label="Questions">
        {quiz.keys.map((k) => {
          const w = waitingIn(k);
          return (
            <button key={k.q} aria-current={k.q === key.q} onClick={() => go(href.checkQ(quiz.id, k.q))}>
              <span className="qn">Q{k.q}</span>
              <span className="clip small">{QTYPES[typeOf(k)].label}</span>
              {w > 0 ? <span className="flag soft" aria-label={`${w} waiting`}>{w}</span> : <span style={{ color: 'var(--ok)' }} aria-label="all decided"><Icon name="check" size={16} /></span>}
            </button>
          );
        })}
      </nav>
      <section className="panel flush" aria-labelledby="q-h">
        <QuestionHead quiz={quiz} k={key} />
        <div className="row spread" style={{ padding: '10px 20px', borderBottom: '1px solid var(--rule)' }}>
          <p className="keys" aria-label="Keyboard">
            <span><kbd>J</kbd> <kbd>K</kbd> move</span>
            <span><kbd>Enter</kbd> {isOpen(type) ? 'ink the suggestion' : 'the reading is right'}</span>
            {isOpen(type) && type === 'short' && <span><kbd>1</kbd>–<kbd>{Math.min(6, keyPoints(key.answer).length)}</kbd> key point</span>}
            {isOpen(type) && <span><kbd>0</kbd> no marks</span>}
            <span><kbd>E</kbd> edit the reading</span>
            <span><kbd>N</kbd> next question</span>
          </p>
          <span className="small muted">{waiting ? `${waiting} of ${rows.length} waiting` : `All ${rows.length} decided`}</span>
        </div>
        <ol className="answers" aria-label={`Answers to question ${key.q}`}>
          {rows.map((s, i) => {
            const m = s.marks.find((x) => x.q === key.q);
            if (!m) return null;
            return <AnswerRow key={s.id} k={key} m={m} sheet={s} who={nameOf(s)} whoHref={href.check(quiz.id, s.id)} focus={i === focus} onFocus={() => setFocus(i)} onChange={(nm) => setMark(s, nm)}
              onDone={() => { const n = rows.findIndex((x, j) => j > i && needsCheck(x.marks.find((mm) => mm.q === key.q)!)); if (n >= 0) setFocus(n); }} />;
          })}
        </ol>
        <div className="row spread" style={{ padding: '14px 20px', borderTop: '1px solid var(--rule)' }}>
          <span className="small muted">Question {quiz.keys.findIndex((k) => k.q === key.q) + 1} of {quiz.keys.length}</span>
          <button className="btn primary" onClick={nextQ}>{quiz.keys.some((k) => k.q !== key.q && waitingIn(k) > 0) ? 'Next question with marks waiting' : 'See results'} <kbd>N</kbd></button>
        </div>
      </section>
    </div>
  );
}

function QuestionHead({ quiz, k }: { quiz: QuizRec; k: QuestionKey }) {
  const type = typeOf(k);
  const pts = keyPoints(k.answer);
  const rubric = parseRubric(k.answer);
  return (
    <div className="qkey">
      <div className="row spread">
        <span className="small muted">Question {k.q} · {QTYPES[type].label} · {outOfFor(k)} mark{outOfFor(k) === 1 ? '' : 's'}</span>
        <span className={`chip ${QTYPES[type].markedBy === 'code' ? 'code' : 'pencil'}`}>{QTYPES[type].markedBy === 'code' ? 'Marked by code' : 'Gemini Nano suggests, you decide'}</span>
      </div>
      <h2 id="q-h" className="prompt" style={{ margin: 0 }}>{k.prompt || `Question ${k.q}`}</h2>
      {type === 'short' ? (
        <div className="row keyline" style={{ gap: 14 }}>{pts.map((p, i) => <span key={i} className="kp"><b>{i + 1}</b>{p}</span>)}</div>
      ) : type === 'passage' && rubric ? (
        <div className="row keyline" style={{ gap: 14 }}>{rubric.map((l, i) => <span key={i} className="kp"><b>{l.max}</b>{l.line}</span>)}</div>
      ) : (
        <div className="keyline">Key: <b>{k.answer}</b>{k.spellingCounts ? ' (spelling must be exact)' : ''}</div>
      )}
      {quiz.extract && type !== 'fraction' && <details className="peek-d"><summary>Show the reading extract</summary><p className="small" style={{ marginTop: 6 }}>{quiz.extract}</p></details>}
    </div>
  );
}

// ------------------------------------------------------------------ one answer, in either mode
function AnswerRow({ k, m, sheet, who, whoHref, focus, onFocus, onChange, onDone }: { k: QuestionKey; m: Marked; sheet: SheetRec; who: string; whoHref?: string; focus: boolean; onFocus: () => void; onChange: (m: Marked) => void; onDone: () => void }) {
  const type = typeOf(k);
  const open = isOpen(type);
  const ref = useRef<HTMLLIElement>(null);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.read);
  const [peek, setPeek] = useState(false);
  useEffect(() => setText(m.read), [m.read]);
  useEffect(() => { if (focus) ref.current?.scrollIntoView({ block: 'nearest' }); }, [focus]);
  const decided = !needsCheck(m);
  const draw = useInkMoment(`${sheet.id}:${m.q}`, decided);
  const pts = keyPoints(k.answer);
  const rubric = parseRubric(k.answer) ?? [];
  const outOf = m.outOf ?? outOfFor(k);
  const met = m.met ?? (m.checked ? undefined : m.suggestion?.met) ?? pts.map(() => false);
  const lines = m.lines ?? m.suggestion?.lines ?? rubric.map((r) => ({ score: 0, max: r.max }));

  const accept = useCallback(() => {
    if (open) { if (m.suggestion || m.checked) onChange(decideOpen(k, m)); }
    else if (m.status !== 'unreadable') onChange({ ...m, checked: true });
    else return;
    onDone();
  }, [k, m, open, onChange, onDone]);
  const toggle = (i: number) => onChange(decideOpen(k, m, { met: met.map((v, j) => (j === i ? !v : v)) }));
  const setLine = (i: number, v: number) => onChange(decideOpen(k, m, { lines: lines.map((l, j) => (j === i ? { ...l, score: Math.max(0, Math.min(l.max, v)) } : l)) }));
  const correct = (t: string) => { onChange(applyCorrection(k, m, t)); setEditing(false); };

  useEffect(() => {
    if (!focus) return;
    const onKey = (e: KeyboardEvent) => {
      if (skipKey(e)) return;
      if (e.key === 'Enter') { e.preventDefault(); accept(); }
      else if (e.key === 'e') { e.preventDefault(); setEditing(true); }
      else if (e.key === 'p') { e.preventDefault(); setPeek((x) => !x); }
      else if (open && e.key === '0') { e.preventDefault(); onChange(decideOpen(k, m, { points: 0 })); onDone(); }
      else if (open && type === 'short' && /^[1-6]$/.test(e.key) && Number(e.key) <= pts.length) { e.preventDefault(); toggle(Number(e.key) - 1); }
      else if (!open && /^[1-3]$/.test(e.key) && m.suggestions[Number(e.key) - 1]) { e.preventDefault(); correct(m.suggestions[Number(e.key) - 1]); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });

  const s = m.suggestion;
  const pending = m.status === 'pending' && !m.checked;
  const shownPoints = m.points ?? (pending ? s?.points : undefined);
  return (
    <li ref={ref} className={`ans${focus ? ' focus' : ''}${decided ? ' done' : ''}`} onClick={onFocus} aria-current={focus ? 'true' : undefined}>
      <div className="margin">
        <AnswerMark m={m} draw={draw} />
        {open && shownPoints !== undefined && <span className={`pts${pending ? ' pencil' : ''}`}>{fmtPoints(shownPoints)}/{fmtPoints(outOf)}</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          {whoHref ? <a className="who" href={whoHref}>{who}</a> : <span className="who">{who}</span>}
          {nameNeedsCheck(sheet) && <span className="flag soft">name to confirm</span>}
          {m.flags.includes('teacher_changed') && <span className="tiny quiet">changed by you</span>}
        </div>
        {editing ? (
          <div className="row" style={{ marginTop: 4 }}>
            {open ? <textarea data-student autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="Corrected reading" style={{ minHeight: 70 }} />
              : <input data-student autoFocus value={text} onChange={(e) => setText(e.target.value)} aria-label="Corrected reading" style={{ maxWidth: 260 }} onKeyDown={(e) => { if (e.key === 'Enter') correct(text); if (e.key === 'Escape') setEditing(false); }} />}
            <button className="btn small primary" onClick={() => correct(text)}>Save reading</button>
            <button className="btn small quiet" onClick={() => { setEditing(false); setText(m.read); }}>Cancel</button>
          </div>
        ) : (
          <p className={`text${open ? '' : ' short'}`} lang="en">{m.read || <span className="quiet">(blank)</span>}{m.crossedOut && <span className="small quiet"> · crossed out: <s>{m.crossedOut}</s></span>}</p>
        )}
        {!open && (m.misconception || m.note || openFlags(m).length > 0 || (m.status === 'unreadable' && !m.checked)) && (
          <div className="row small" style={{ gap: 6, marginTop: 6 }}>
            {openFlags(m).map((f) => <span key={f} className="flag">{FLAG_TEXT[f]}</span>)}
            {m.status === 'unreadable' && !m.checked && openFlags(m).length === 0 && <span className="flag">{FLAG_TEXT.unreadable}</span>}
            {m.misconception && <span className="mistake"><b>{mistakeLabel(m.misconception)}</b></span>}
            {m.note && <span className="muted">{m.note}</span>}
          </div>
        )}
        {open && s && pending && (
          <div className="sugg">
            <span className="why">{s.reason || 'No reason given.'}</span>
            <span className="tiny">Suggested by Gemini Nano {s.where === 'on_device' ? `on this laptop in ${(s.ms / 1000).toFixed(1)} s` : s.where === 'recorded' ? '(recorded cloud suggestion; this browser has no on-device AI)' : 'in the cloud (made-up sheet)'}. In our test on 146 real pupils' answers that people had marked, Nano's suggestion matched the human mark half the time and was within one mark 9 times in 10, so it is always your call.</span>
          </div>
        )}
        {open && !s && pending && m.read && <div className="sugg"><span className="tiny">No suggestion for this answer. Tick the key points it states, or set the rubric scores.</span></div>}
        {open && type === 'short' && m.read && (
          <div className="row" style={{ gap: 6, marginTop: 8 }} role="group" aria-label="Key points stated">
            {pts.map((p, i) => (
              <button key={i} className="kptoggle" aria-pressed={!!met[i] && (!pending || !!s)} onClick={(e) => { e.stopPropagation(); toggle(i); }} title={p}>
                <Icon name={met[i] && (!pending || s) ? 'check' : 'x'} />{i + 1}. <span className="clip" style={{ maxWidth: 220 }}>{p}</span>
              </button>
            ))}
          </div>
        )}
        {open && type === 'passage' && m.read && (
          <div className="lines">
            {rubric.map((r, i) => (
              <div key={i} className="line">
                <span>{r.line}</span>
                <span className="stepper" role="group" aria-label={`${r.line} score`}>
                  <button aria-label={`Lower ${r.line}`} onClick={(e) => { e.stopPropagation(); setLine(i, (lines[i]?.score ?? 0) - 1); }}>−</button>
                  <span className={pending ? 'hand' : ''} style={{ color: pending ? 'var(--pencil)' : 'var(--red)' }}>{lines[i]?.score ?? 0}/{r.max}</span>
                  <button aria-label={`Raise ${r.line}`} onClick={(e) => { e.stopPropagation(); setLine(i, (lines[i]?.score ?? 0) + 1); }}>+</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {peek && <Peek sheet={sheet} />}
      </div>
      <div className="actions">
        {!open && needsCheck(m) && m.suggestions.slice(0, 3).map((x, j) => <button key={x} className="btn small" onClick={(e) => { e.stopPropagation(); correct(x); }}>It says {x} <kbd>{j + 1}</kbd></button>)}
        {!open && needsCheck(m) && (m.status === 'unreadable'
          ? <button className="btn small" onClick={(e) => { e.stopPropagation(); onChange(markWrongByTeacher(m)); onDone(); }}>Mark wrong</button>
          : <button className="btn small ink" onClick={(e) => { e.stopPropagation(); accept(); }}>Reading is right <kbd>Enter</kbd></button>)}
        {open && pending && s && <button className="btn small ink" onClick={(e) => { e.stopPropagation(); accept(); }}>Ink {fmtPoints(s.points)}/{fmtPoints(outOf)} <kbd>Enter</kbd></button>}
        {open && pending && m.read && <button className="btn small" onClick={(e) => { e.stopPropagation(); onChange(decideOpen(k, m, { points: 0 })); onDone(); }}>No marks <kbd>0</kbd></button>}
        {open && pending && m.read && <button className="btn small" onClick={(e) => { e.stopPropagation(); onChange(decideOpen(k, m, { points: outOf })); onDone(); }}>Full marks</button>}
        {!editing && <button className="btn small quiet" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>Edit <kbd>E</kbd></button>}
        {(sheet.sampleId || sheet.imageId) && <button className="btn small quiet" aria-expanded={peek} onClick={(e) => { e.stopPropagation(); setPeek(!peek); }}>{peek ? 'Hide sheet' : 'Sheet'} <kbd>P</kbd></button>}
      </div>
    </li>
  );
}

function Peek({ sheet }: { sheet: SheetRec }) {
  const url = usePhoto(sheet);
  return url ? <div className="peek" style={{ marginTop: 10 }}><img src={url} alt="Photo of this pupil's worksheet" /></div> : null;
}

// ------------------------------------------------------------------ by sheet
function BySheet({ quiz, cls, sheets, sheetId, save }: { quiz: QuizRec; cls: ClassRec; sheets: SheetRec[]; sheetId: string; save: (s: SheetRec) => void }) {
  const sheet = sheets.find((s) => s.id === sheetId) ?? sheets[0];
  const url = usePhoto(sheet);
  const [zoom, setZoom] = useState(false);
  const [focus, setFocus] = useState(() => Math.max(0, sheet.marks.findIndex(needsCheck)));
  useEffect(() => setFocus(Math.max(0, sheet.marks.findIndex(needsCheck))), [sheet.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const latest = useRef(sheet);
  latest.current = sheet;
  const setMark = (m: Marked) => { const cur = latest.current; const next = { ...cur, marks: cur.marks.map((x) => (x.q === m.q ? m : x)) }; latest.current = next; save(next); };
  const ordered = useMemo(() => [...sheets].sort((a, b) => Number(sheetNeeds(b)) - Number(sheetNeeds(a)) || a.createdAt - b.createdAt), [sheets.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = () => { const i = ordered.findIndex((s) => s.id === sheet.id); const n = [...ordered.slice(i + 1), ...ordered.slice(0, i)].find(sheetNeeds); go(n ? href.check(quiz.id, n.id) : href.results(quiz.id)); };
  const taken = new Set(sheets.filter((s) => s.id !== sheet.id).map((s) => s.studentId));
  const score = scoreSheet(sheet.marks, quiz.unsimplifiedCredit);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (skipKey(e)) return;
      if (e.key === 'j' || e.key === 'ArrowDown') { e.preventDefault(); setFocus((f) => Math.min(sheet.marks.length - 1, f + 1)); }
      else if (e.key === 'k' || e.key === 'ArrowUp') { e.preventDefault(); setFocus((f) => Math.max(0, f - 1)); }
      else if (e.key === 'n') { e.preventDefault(); next(); }
      else if (e.key === 'z') { e.preventDefault(); setZoom((z) => !z); }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
  return (
    <div className="sheetview">
      <div className={`photo${zoom ? ' zoomed' : ''}`}>
        {url ? <img src={url} alt="Photo of this pupil's worksheet" onClick={() => setZoom(!zoom)} /> : <p className="muted" style={{ padding: 20 }}>{sheet.source === 'typed' ? 'Typed-in answers have no photo.' : 'The photo was deleted after checking.'}</p>}
      </div>
      <section className="panel flush" aria-label="This pupil's answers">
        <div className="qkey">
          <div className="row spread" style={{ alignItems: 'flex-start' }}>
            <label className="field grow" style={{ minWidth: 200 }}>Pupil
              <select data-student value={sheet.studentId ?? ''} className={nameNeedsCheck(sheet) ? 'bad' : ''} onChange={(e) => { save({ ...sheet, studentId: e.target.value || null, nameConfident: !!e.target.value }); e.currentTarget.blur(); }}>
                <option value="">Pick a pupil…</option>
                {cls.roster.map((r) => <option key={r.id} value={r.id} disabled={taken.has(r.id)}>{r.name}{taken.has(r.id) ? ' (already has a sheet)' : ''}</option>)}
              </select>
              <span className="hint">Name on the sheet read as "{sheet.readName || 'nothing'}".</span>
            </label>
            <ScoreRing points={score.points} outOf={score.outOf} open={score.unreadable + score.pending > 0} big />
          </div>
          {sheet.studentId && !sheet.nameConfident && (
            <Notice tone="warn"><p>Is this {cls.roster.find((r) => r.id === sheet.studentId)?.name}'s sheet? The name didn't match the class list exactly.</p><div className="row"><button className="btn small primary" onClick={() => save({ ...sheet, nameConfident: true })}>Yes, the name is right</button></div></Notice>
          )}
          <div className="row small"><WhereChip where={sheet.source === 'typed' ? 'typed' : sheet.where} ms={sheet.ms} />{sheet.rereadQs?.length ? <span className="muted">Read twice: Q{sheet.rereadQs.join(', Q')}</span> : null}</div>
        </div>
        <ol className="answers">
          {sheet.marks.map((m, i) => {
            const k = quiz.keys.find((x) => x.q === m.q)!;
            return <AnswerRow key={`${sheet.id}-${m.q}`} k={k} m={m} sheet={sheet} who={`Q${m.q} · ${k.prompt ? k.prompt.slice(0, 80) : QTYPES[typeOf(k)].label}`} focus={i === focus} onFocus={() => setFocus(i)} onChange={setMark}
              onDone={() => { const n = sheet.marks.findIndex((x, j) => j > i && needsCheck(x)); if (n >= 0) setFocus(n); }} />;
          })}
        </ol>
        <div className="row spread" style={{ padding: '14px 20px', borderTop: '1px solid var(--rule)' }}>
          <span className="small muted">Sheet {Math.max(1, ordered.findIndex((x) => x.id === sheet.id) + 1)} of {sheets.length} · <kbd>Z</kbd> zoom the photo</span>
          <div className="row">
            <button className="btn small quiet danger" onClick={async () => { if (!window.confirm('Remove this sheet and its photo from the quiz? This cannot be undone.')) return; await store.deleteSheet(sheet); location.reload(); }}>Remove sheet</button>
            <button className="btn primary" onClick={next}>Next sheet to check <kbd>N</kbd></button>
          </div>
        </div>
      </section>
    </div>
  );
}
