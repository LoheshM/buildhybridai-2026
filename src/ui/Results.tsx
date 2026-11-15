import { useMemo } from 'react';
import { href } from '../app/router';
import { sampleKeyOfClass, sampleManifest } from '../app/boot';
import { accuracy, openAccuracy } from '../marking/accuracy';
import { outOfFor, pointsFor, scoreSheet, typeOf, type QuestionKey } from '../marking/mark';
import { mistakeLabel } from '../marking/mistakes';
import { needsCheck } from '../marking/pipeline';
import { keyPoints, parseRubric, QTYPES } from '../marking/qtypes';
import { MIN_SHEETS } from '../privacy/aggregate';
import { csvAnswer, csvCell } from '../privacy/templates';
import { store, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { useLoad, useToast } from './hooks';
import { Notice } from './App';
import { AnswerMark, fmtPoints } from './Marks';

export function Results({ quizId }: { quizId: string }) {
  const [ctx, reload] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    const all = quiz ? await store.sheets(quiz.id) : [];
    return { quiz, cls, total: all.length, sheets: all.filter((s) => s.status === 'read' || s.status === 'checked') };
  }, [quizId]);
  const [toast, setToast] = useToast();
  const view = useMemo(() => (ctx?.quiz && ctx.cls ? summarise(ctx.sheets, ctx.quiz, ctx.cls) : null), [ctx]);
  if (!ctx || !view) return <p className="muted">Loading results…</p>;
  const { quiz, cls, sheets } = ctx;
  if (!quiz || !cls) return <p>This quiz no longer exists.</p>;
  if (!sheets.length) return <div className="panel"><h2>No results yet</h2><p className="muted">Read some sheets first.</p><a className="btn primary" href={href.scan(quizId)}>Go to the sheets</a></div>;
  const name = (s: SheetRec) => cls.roster.find((r) => r.id === s.studentId)?.name ?? `"${s.readName || 'name not read'}"`;
  const outOf = quiz.keys.reduce((a, k) => a + outOfFor(k), 0);

  const exportCsv = () => {
    const head = ['Pupil', ...quiz.keys.map((k) => `Q${k.q}`), 'Score', 'Out of'];
    const lines = sheets.map((s) => { const sc = scoreSheet(s.marks, quiz.unsimplifiedCredit); return [csvCell(name(s)), ...s.marks.map((m) => csvAnswer(m.read)), sc.unreadable + sc.pending ? '?' : String(sc.points), String(sc.outOf)]; });
    const blob = new Blob(['﻿' + [head.map(csvCell), ...lines].map((l) => l.join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${quiz.title.replace(/[^\w -]/g, '')} marks.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      {ctx.total > sheets.length && <Notice>{sheets.length} of {ctx.total} sheets are read so far. <a href={href.scan(quizId)}>Read the rest</a> before planning a lesson.</Notice>}
      {view.waiting > 0 && <Notice tone="warn"><p>{view.waiting} mark{view.waiting === 1 ? ' is' : 's are'} still in pencil or flagged. Totals below count them as Tickmark's best guess until you <a href={href.check(quizId)}>decide them</a>.</p></Notice>}

      <p className="summary-line" aria-label="Summary">
        <b>{sheets.length}{ctx.total > sheets.length ? ` of ${ctx.total}` : ''} sheets</b> marked · class average <b>{fmtPoints(Math.round(view.avg * 2) / 2)}/{fmtPoints(outOf)}</b>{view.waiting ? ' so far' : ''}
        {view.waiting ? <> · <a href={href.check(quizId)}><b>{view.waiting}</b> marks waiting for you</a></> : ' · every mark decided'}
        {' · '}{view.onDevice ? <>read on this laptop: <b>{view.onDevice}/{sheets.length}</b>{view.deviceTime ? ` (${view.deviceTime})` : ''}</> : <>read without on-device AI: {view.sourceLabel}</>}
      </p>

      <section aria-labelledby="reg-h">
        <div className="panel-head">
          <h2 id="reg-h">The register</h2>
          <span className="small muted">Pencil: suggested, not decided yet. Hatched: waiting for you. Click a name to open the sheet.</span>
        </div>
        <div className="register-wrap">
          <table className="register">
            <thead><tr><th className="who" scope="col">Pupil</th>{quiz.keys.map((k) => <th key={k.q} scope="col" title={k.prompt}>Q{k.q}<span className="qt">{outOfFor(k) > 1 ? `out of ${outOfFor(k)}` : QTYPES[typeOf(k)].short}</span></th>)}<th scope="col">Score</th></tr></thead>
            <tbody>
              {sheets.map((s) => {
                const sc = scoreSheet(s.marks, quiz.unsimplifiedCredit);
                return (
                  <tr key={s.id}>
                    <th className="who" scope="row"><a href={href.check(quizId, s.id)}>{name(s)}</a></th>
                    {s.marks.map((m) => (
                      <td key={m.q} className={`cell ${m.status === 'pending' ? 'pending' : m.status === 'wrong' ? 'wrong' : m.status === 'partial' || m.status === 'unsimplified' ? 'partial' : ''}${needsCheck(m) ? ' needs' : ''}`}
                        title={`${m.read ? `"${m.read.slice(0, 120)}"` : 'Blank'}${m.misconception ? `: ${mistakeLabel(m.misconception)}` : ''}${needsCheck(m) ? ' (waiting for you)' : ''}`}>
                        {(m.outOf ?? 1) > 1 && m.status !== 'pending' && m.status !== 'blank' ? <span className="hand" style={{ color: 'var(--red)', fontWeight: 700 }}>{fmtPoints(pointsFor(m, quiz.unsimplifiedCredit))}</span> : <AnswerMark m={m} />}
                      </td>
                    ))}
                    <td className="total"><span className="hand" style={{ color: sc.pending + sc.unreadable ? 'var(--pencil)' : 'var(--red)', fontSize: '1.05rem' }}>{fmtPoints(sc.points)}{sc.pending + sc.unreadable ? '?' : ''}</span><span className="quiet small">/{fmtPoints(sc.outOf)}</span></td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th className="who" scope="row">Full marks</th>{view.questions.map((q) => { const decided = q.n - q.waiting; return <td key={q.k.q} title={q.waiting ? `${q.waiting} still waiting for you` : undefined}>{decided ? `${Math.round(pct(q.right, decided))}%` : '–'}</td>; })}<td /></tr></tfoot>
          </table>
        </div>
      </section>

      <section className="section" aria-labelledby="qmap-h">
        <div className="panel-head">
          <h2 id="qmap-h">What the class got wrong</h2>
          <a className={`btn ${sheets.length >= MIN_SHEETS ? 'primary' : ''}`} href={href.reteach(quizId)} aria-disabled={sheets.length < MIN_SHEETS}>Plan tomorrow's lesson</a>
        </div>
        <div className="panel flush qmap">
          {view.questions.map((q) => (
            <div key={q.k.q} className="qrow">
              <span className="qn" aria-label={`Question ${q.k.q}`}>{q.k.q}</span>
              <div style={{ minWidth: 0 }}>
                <div className="prompt" title={q.k.prompt}>{q.k.prompt || `Question ${q.k.q}`}</div>
                <div className="counts"><span className={`chip ${QTYPES[q.type].markedBy === 'code' ? 'code' : 'pencil'}`}>{QTYPES[q.type].label}</span> key: {q.keyText}</div>
              </div>
              <div>
                <div className="qbar" role="img" aria-label={`${q.right} right, ${q.partial} partly right, ${q.wrong} wrong, ${q.other} blank, ${q.waiting} waiting for you`}>
                  <i className="r" style={{ width: `${pct(q.right, q.n)}%` }} /><i className="p" style={{ width: `${pct(q.partial, q.n)}%` }} /><i className="w" style={{ width: `${pct(q.wrong, q.n)}%` }} /><i className="o" style={{ width: `${pct(q.other, q.n)}%` }} /><i className="pen" style={{ width: `${pct(q.waiting, q.n)}%` }} />
                </div>
                <div className="counts">{q.waiting === q.n ? `All ${q.n} waiting for you` : <>{q.right} right{q.partial ? ` · ${q.partial} partly` : ''} · {q.wrong} wrong{q.other ? ` · ${q.other} blank` : ''}{q.waiting ? ` · ${q.waiting} waiting for you` : ''}</>}</div>
              </div>
              <div className="mistakes">
                {q.options.length > 0 ? (
                  <span className="picks"><span className="small muted">Wrong picks:</span>{q.options.map(([o, n]) => <span key={o} className="pick" title={`${n} pupils picked ${o}`}>{o === 'true' ? 'True' : o === 'false' ? 'False' : o}<b>{n}</b></span>)}</span>
                ) : q.groups.length === 0 ? <span className="small muted">{q.waiting && !(q.wrong + q.partial) ? <a href={href.checkQ(quizId, q.k.q)}>Decide the pencil marks first</a> : q.wrong + q.partial ? 'No common pattern' : 'Nothing to reteach'}</span> : q.groups.map((g) => (
                  <span key={g.id} className="mistake" title={g.names.join(', ')}><b>{g.count}</b>{g.label}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {view.acc && (
        <section className="section" aria-labelledby="acc-h">
          <h2 id="acc-h">How well the reading went</h2>
          <p className="muted">This class is made up, so its right answers are known and Tickmark can score its own run. Measured on the sheets you just read.</p>
          <p className="small">
            <b>{view.acc.exact.exact} of {view.acc.exact.answers}</b> exact answers read exactly, and <b>{view.acc.exact.unflagged}</b> misreads weren't flagged for you.
            {view.acc.open.answers > 0 && <> In {view.acc.open.answers} sentences and paragraphs, <b>{(100 - (100 * view.acc.open.charErrors) / Math.max(1, view.acc.open.chars)).toFixed(1)}%</b> of characters were read right.</>}
            {view.acc.open.suggested > 0 && <> <b>{view.acc.open.agree} of {view.acc.open.suggested}</b> suggested marks equalled the reference mark ({view.acc.open.within1} within one mark).</>}
          </p>
        </section>
      )}


      <div className="row section noprint">
        <button className="btn" onClick={exportCsv}>Download marks (CSV)</button>
        <button className="btn" onClick={() => window.print()}>Print</button>
        {!cls.sample && <button className="btn danger" onClick={async () => { await store.deletePhotos(quizId); setToast('Photos deleted from this browser. Marks are kept.'); reload(); }}>Delete the photos, keep the marks</button>}
      </div>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

const pct = (a: number, n: number) => (n ? (100 * a) / n : 0);

function summarise(sheets: SheetRec[], quiz: QuizRec, cls: ClassRec) {
  const credit = quiz.unsimplifiedCredit;
  const scored = sheets.map((s) => scoreSheet(s.marks, credit));
  const avg = scored.reduce((a, s) => a + s.points, 0) / Math.max(1, scored.length);
  const waiting = sheets.reduce((a, s) => a + s.marks.filter(needsCheck).length, 0);
  const ms = sheets.filter((s) => s.where === 'on_device').reduce((a, s) => a + (s.ms ?? 0) + (s.rereadMs ?? 0) + s.marks.reduce((b, m) => b + (m.suggestion?.where === 'on_device' ? m.suggestion.ms : 0), 0), 0);
  const deviceTime = ms ? `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s` : '';
  const nameOf = (s: SheetRec) => cls.roster.find((r) => r.id === s.studentId)?.name ?? s.readName ?? '?';
  const questions = quiz.keys.map((k) => qsummary(k, sheets, nameOf));
  const sk = sampleKeyOfClass(cls.id);
  const man = sk ? sampleManifest(sk) : null;
  const acc = man ? {
    exact: accuracy(sheets, man.students, true),
    open: openAccuracy(sheets, man.students, (q, ref) => {
      const k = quiz.keys.find((x) => x.q === q);
      if (!k) return null;
      const out = outOfFor(k);
      if (typeOf(k) === 'passage') { const r = parseRubric(k.answer) ?? []; const max = r.reduce((a, l) => a + l.max, 0) || 1; return Math.round(((ref as number[]).reduce((a, b) => a + b, 0) / max) * out * 2) / 2; }
      const n = keyPoints(k.answer).length || 1;
      return Math.round(((ref as boolean[]).filter(Boolean).length / n) * out * 2) / 2;
    }),
  } : null;
  const recorded = sheets.filter((s) => s.where === 'recorded').length, cloud = sheets.filter((s) => s.where === 'in_cloud').length, typed = sheets.filter((s) => s.where === 'local').length;
  const sourceLabel = [cloud ? `${cloud} cloud` : '', recorded ? `${recorded} recorded` : '', typed ? `${typed} typed` : ''].filter(Boolean).join(' · ') || '–';
  return { avg, waiting, deviceTime, onDevice: sheets.filter((s) => s.where === 'on_device').length, sourceLabel, questions, acc };
}

function qsummary(k: QuestionKey, sheets: SheetRec[], nameOf: (s: SheetRec) => string) {
  const type = typeOf(k);
  let right = 0, partial = 0, wrong = 0, other = 0, waiting = 0;
  const groups = new Map<string, string[]>();
  const options = new Map<string, number>();
  const pts = keyPoints(k.answer), rubric = (parseRubric(k.answer) ?? []).map((l) => l.line);
  for (const s of sheets) {
    const m = s.marks.find((x) => x.q === k.q);
    if (!m) continue;
    if (m.status === 'correct') { right++; continue; }
    if (m.status === 'partial') partial++;
    else if (m.status === 'wrong') wrong++;
    else { if (m.status === 'pending' || (m.status === 'unreadable' && !m.checked)) waiting++; else other++; continue; }
    if (type === 'choice' && m.picked) options.set(m.picked, (options.get(m.picked) ?? 0) + 1);
    const labels = m.mistakes?.length ? m.mistakes : m.misconception ? [m.misconception] : type === 'choice' ? [] : ['other'];
    for (const g of labels) groups.set(g, [...(groups.get(g) ?? []), nameOf(s)]);
  }
  return {
    k, type, right, partial, wrong, other, waiting, n: right + partial + wrong + other + waiting,
    keyText: type === 'short' ? `${pts.length} key point${pts.length === 1 ? '' : 's'}` : type === 'passage' ? `${rubric.length}-line rubric` : k.answer,
    groups: [...groups.entries()].map(([id, names]) => ({ id, label: mistakeLabel(id, pts, rubric), count: names.length, names })).sort((a, b) => Number(a.id === 'other') - Number(b.id === 'other') || b.count - a.count),
    options: [...options.entries()].sort((a, b) => b[1] - a[1]),
  };
}
