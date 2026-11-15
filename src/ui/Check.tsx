// Check: turn pencil into ink. By question (every pupil's answer to one question, like marking a
// pile) or by sheet (one pupil's whole sheet beside the photo). One key per decision.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { go, href } from '../app/router';
import { onSheetChanged, runState } from '../app/runner';
import { FLAG_TEXT, outOfFor, scoreSheet, typeOf, type Marked, type QuestionKey } from '../marking/mark';
import { mistakeLabel } from '../marking/mistakes';
import { adjustSuggestion, decideOpen } from '../marking/open';
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

  // "Check them" opens without a question: fix the first waiting one in the URL, so deciding its last
  // answer never moves the view (and the next Enter) to another question
  useEffect(() => {
    if (sheetId || q !== undefined || !ctx?.quiz || !ctx.sheets.length) return;
    const quiz = ctx.quiz;
    const first = quiz.keys.find((k) => ctx.sheets.some((s) => { const m = s.marks.find((x) => x.q === k.q); return m && needsCheck(m); }))?.q ?? quiz.keys[0]?.q ?? 1;
    location.replace(href.checkQ(quizId, first));
  }, [ctx, q, sheetId, quizId]);

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
  const allDecided = quiz.keys.every((k) => waitingIn(k) === 0) && sheets.every((s) => !nameNeedsCheck(s));
  return (
    <div className="check-layout">
      <nav className="qnav" aria-label="Questions">
        {quiz.keys.map((k) => {
          const w = waitingIn(k);
          return (
            <button key={k.q} aria-current={k.q === key.q} onClick={() => go(href.checkQ(quiz.id, k.q))}>
              <span className="qn">Q{k.q}</span>
              <span className="clip small">{QTYPES[typeOf(k)].short}</span>
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
        {allDecided && <DoneMoment quiz={quiz} sheets={sheets} />}
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
      <div className="row spread" style={{ alignItems: 'flex-start' }}>
        <h2 id="q-h" className="prompt grow" style={{ margin: 0 }}>{k.q}. {k.prompt || `Question ${k.q}`}</h2>
        <span className={`chip ${QTYPES[type].markedBy === 'code' ? 'code' : 'pencil'}`}>{QTYPES[type].markedBy === 'code' ? 'Marked by code' : 'Suggested in pencil, you decide'}</span>
      </div>
      <p className="qmeta">{QTYPES[type].label} · {outOfFor(k)} mark{outOfFor(k) === 1 ? '' : 's'}</p>
      {type === 'short' ? (
        <div className="row keyline" style={{ gap: 14 }}>{pts.map((p, i) => <span key={i} className="kp"><b>{i + 1}</b>{p}</span>)}</div>
      ) : type === 'passage' && rubric ? (
        <div className="row keyline" style={{ gap: 14 }}>{rubric.map((l, i) => <span key={i} className="kp"><b>{l.max}</b>{l.line}</span>)}</div>
      ) : (
        <div className="keyline">Key: <b>{k.answer}</b>{k.spellingCounts ? ' (spelling must be exact)' : ''}</div>
      )}
      {QTYPES[type].markedBy === 'suggested' && <p className="tiny muted" style={{ margin: 0 }}>Pencil marks are AI suggestions: Gemini Nano on this laptop, or recorded cloud Gemini for the made-up sheets when a browser has no Nano. On 148 real pupils' answers that people had marked, Nano's suggestion matched the human mark half the time and was within one mark 9 times in 10 (15 Nov 2026), so every one is your call.</p>}
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
  const first = useRef(true);
  useEffect(() => {
    if (focus) { ref.current?.focus({ preventScroll: true }); if (!first.current) ref.current?.scrollIntoView({ block: 'nearest' }); }
    first.current = false;
  }, [focus]);
  const decided = !needsCheck(m);
  const draw = useInkMoment(`${sheet.id}:${m.q}`, decided);
  const pts = keyPoints(k.answer);
  const rubric = parseRubric(k.answer) ?? [];
  const outOf = m.outOf ?? outOfFor(k);
  const met = (m.checked ? m.met : m.suggestion?.met) ?? m.met ?? pts.map(() => false);
  const lines = m.lines ?? m.suggestion?.lines ?? rubric.map((r) => ({ score: 0, max: r.max }));

  const accept = useCallback(() => {
    if (open) { if (m.suggestion || m.checked) onChange(decideOpen(k, m)); else return; }
    else if (m.status !== 'unreadable') onChange({ ...m, checked: true });
    else return;
    onDone();
  }, [k, m, open, onChange, onDone]);
  const undecided = m.status === 'pending' && !m.checked;
  // undecided: the teacher adjusts the pencil and inks it with Enter; decided: the change is in ink
  const toggle = (i: number) => { const nm = met.map((v, j) => (j === i ? !v : v)); onChange(undecided ? adjustSuggestion(k, m, { met: nm }) : decideOpen(k, m, { met: nm })); };
  const setLine = (i: number, v: number) => { const nl = lines.map((l, j) => (j === i ? { ...l, score: Math.max(0, Math.min(l.max, v)) } : l)); onChange(undecided ? adjustSuggestion(k, m, { lines: nl }) : decideOpen(k, m, { lines: nl })); };
  // clicking a chip must not take keyboard focus away from the row (E3)
  const keep = (e: React.MouseEvent) => e.preventDefault();
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
    <li ref={ref} tabIndex={-1} className={`ans${focus ? ' focus' : ''}${decided ? ' done' : ''}`} onClick={onFocus} aria-current={focus ? 'true' : undefined}>
      <div className="margin">
        <AnswerMark m={m} draw={draw} />
        {open && shownPoints !== undefined && <span className={`pts${pending ? ' pencil' : ''}`}>{fmtPoints(shownPoints)}/{fmtPoints(outOf)}</span>}
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 8 }}>
          {whoHref ? <a className="who" href={whoHref}>{who}</a> : <span className="who who-q">{who}</span>}
          {whoHref && nameNeedsCheck(sheet) && <span className="flag soft">name to confirm</span>}
          {m.flags.includes('teacher_changed') && <span className="tiny quiet">changed by you</span>}
        </div>
        {sheet.crops?.[m.q] && <Crop id={sheet.crops[m.q]} label={`Q${m.q} as the pupil wrote it`} />}
        {editing ? (
          <div className="row" style={{ marginTop: 4 }}>
            {open ? <textarea data-student autoFocus spellCheck={false} autoCorrect="off" autoCapitalize="off" value={text} onChange={(e) => setText(e.target.value)} aria-label="Corrected reading" style={{ minHeight: 70 }} />
              : <input data-student autoFocus spellCheck={false} autoCorrect="off" autoCapitalize="off" value={text} onChange={(e) => setText(e.target.value)} aria-label="Corrected reading" style={{ maxWidth: 260 }} onKeyDown={(e) => { if (e.key === 'Enter') correct(text); if (e.key === 'Escape') setEditing(false); }} />}
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
          <p className="sugg">
            <span className="why">{s.reason || 'No reason given.'}</span>{' '}
            <span className="src">({s.where === 'on_device' ? `Gemini Nano on this laptop, ${(s.ms / 1000).toFixed(1)} s` : s.where === 'recorded' ? 'cloud Gemini, recorded' : 'cloud Gemini, made-up sheet'}{s.adjusted ? '; changed by you' : ''})</span>
          </p>
        )}
        {open && !s && pending && m.read && <div className="sugg"><span className="tiny">No suggestion for this answer. Tick the key points it states, or set the rubric scores.</span></div>}
        {open && type === 'short' && m.read && (
          <div className="kprow" role="group" aria-label="Key points stated">
            {pts.map((p, i) => (
              <button key={i} className={`kptoggle${undecided ? ' pencil' : ''}`} aria-pressed={!!met[i]} aria-label={`Key point ${i + 1}: ${p}`} onMouseDown={keep} onClick={(e) => { e.stopPropagation(); toggle(i); }}>
                <Icon name={met[i] ? 'check' : 'x'} /><span className="kpt" title={p}>{i + 1}<span className="kptx">. {p}</span></span>
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
                  <button aria-label={`Lower ${r.line}`} onMouseDown={keep} onClick={(e) => { e.stopPropagation(); setLine(i, (lines[i]?.score ?? 0) - 1); }}><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
                  <span className={pending ? 'hand' : ''} style={{ color: pending ? 'var(--pencil)' : 'var(--red)' }}>{lines[i]?.score ?? 0}/{r.max}</span>
                  <button aria-label={`Raise ${r.line}`} onMouseDown={keep} onClick={(e) => { e.stopPropagation(); setLine(i, (lines[i]?.score ?? 0) + 1); }}><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg></button>
                </span>
              </div>
            ))}
          </div>
        )}
        {peek && <Peek sheet={sheet} />}
      </div>
      <div className="actions" onMouseDown={keep}>
        {!open && needsCheck(m) && m.suggestions.slice(0, 3).map((x, j) => <button key={x} className="btn small" onClick={(e) => { e.stopPropagation(); correct(x); }}>It says {x} <kbd>{j + 1}</kbd></button>)}
        {!open && needsCheck(m) && (m.status === 'unreadable'
          ? <button className="btn small" onClick={(e) => { e.stopPropagation(); onChange(markWrongByTeacher(m)); onDone(); }}>Mark wrong</button>
          : <button className="btn small primary" onClick={(e) => { e.stopPropagation(); accept(); }}>Reading is right <kbd>Enter</kbd></button>)}
        {open && pending && s && <button className="btn small ink" onClick={(e) => { e.stopPropagation(); accept(); }}>Ink {fmtPoints(s.points)}/{fmtPoints(outOf)} <kbd>Enter</kbd></button>}
        {open && pending && m.read && <button className="btn small" onClick={(e) => { e.stopPropagation(); onChange(decideOpen(k, m, { points: 0 })); onDone(); }}>No marks <kbd>0</kbd></button>}
        {open && pending && m.read && <button className="btn small" onClick={(e) => { e.stopPropagation(); onChange(decideOpen(k, m, { points: outOf })); onDone(); }}>Full marks</button>}
        {!editing && <button className="btn small quiet" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>Edit <kbd>E</kbd></button>}
        {(sheet.sampleId || sheet.imageId) && <button className="btn small quiet" aria-expanded={peek} onClick={(e) => { e.stopPropagation(); setPeek(!peek); }}>{peek ? 'Hide sheet' : 'Sheet'} <kbd>P</kbd></button>}
      </div>
    </li>
  );
}

function DoneMoment({ quiz, sheets }: { quiz: QuizRec; sheets: SheetRec[] }) {
  const scores = sheets.map((s) => scoreSheet(s.marks, quiz.unsimplifiedCredit));
  const avg = scores.reduce((a, s) => a + s.points, 0) / Math.max(1, scores.length);
  const outOf = scores[0]?.outOf ?? 0;
  return (
    <div className="done-moment" role="status">
      <ScoreRing points={Math.round(avg * 2) / 2} outOf={outOf} big draw />
      <div className="grow">
        <p><strong>Every mark is in ink.</strong> {sheets.length} sheets, class average {fmtPoints(Math.round(avg * 2) / 2)} out of {fmtPoints(outOf)}.</p>
        <p className="small muted">See what the class got wrong, then plan tomorrow's lesson from totals with no names in them.</p>
      </div>
      <a className="btn primary" href={href.results(quiz.id)}>See results</a>
    </div>
  );
}

/** The pupil's own handwriting for this answer, cut from the answer sheet: always beside Nano's reading. */
function Crop({ id, label }: { id: string; label: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true, u: string | null = null;
    store.image(id).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [id]);
  return url ? <img className="crop" src={url} alt={label} /> : <div className="crop" aria-hidden="true" />;
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
            return <AnswerRow key={`${sheet.id}-${m.q}`} k={k} m={m} sheet={sheet} who={`Q${m.q} · ${k.prompt || QTYPES[typeOf(k)].label}`} focus={i === focus} onFocus={() => setFocus(i)} onChange={setMark}
              onDone={() => { const n = sheet.marks.findIndex((x, j) => j > i && needsCheck(x)); if (n >= 0) setFocus(n); }} />;
          })}
        </ol>
        <div className="row spread" style={{ padding: '14px 20px', borderTop: '1px solid var(--rule)' }}>
          <span className="small muted">Sheet {Math.max(1, ordered.findIndex((x) => x.id === sheet.id) + 1)} of {sheets.length} · <kbd>Z</kbd> zoom the photo</span>
          <button className="btn primary" onClick={next}>Next sheet to check <kbd>N</kbd></button>
        </div>
        <div className="row" style={{ padding: '0 20px 14px' }}>
          <button className="btn small quiet danger" onClick={async () => { if (!window.confirm('Remove this sheet and its photo from the quiz? This cannot be undone.')) return; await store.deleteSheet(sheet); location.reload(); }}>Remove this sheet</button>
        </div>
      </section>
    </div>
  );
}
