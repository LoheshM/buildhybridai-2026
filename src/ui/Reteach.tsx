import { useEffect, useMemo, useRef, useState } from 'react';
import { currentSettings } from '../ai/firebase';
import { setRosterTokens } from '../ai/netGuard';
import { totalsPrompt } from '../ai/prompts';
import type { PracticeItem, TotalsResponse } from '../ai/schemas';
import { planFromTotals, PlanUnavailable, recordedInfo } from '../ai/tasks';
import { dayOf } from '../ai/deviceRecording';
import { sampleKeyOfClass } from '../app/boot';
import { href } from '../app/router';
import { eq, evaluate, extractExpr, format, parse } from '../marking/fraction';
import { scoreSheet } from '../marking/mark';
import { MISTAKES, mistakeLabel } from '../marking/mistakes';
import { needsCheck } from '../marking/pipeline';
import { QTYPES } from '../marking/qtypes';
import { buildTotals, MIN_SHEETS, subjectFor, type Cell, type ClassTotals, type Lang } from '../privacy/aggregate';
import { rosterTokens } from '../privacy/nameCheck';
import { FALLBACK_NOTES, fillTemplate, validTemplate } from '../privacy/templates';
import { store, type PlanRec, type QuizRec, type SheetRec } from '../store/db';
import { useDevice, useLoad, useToast } from './hooks';
import { Notice } from './App';
import { Icon, WhereChip } from './Marks';

const LANG_NAME: Record<Lang, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil' };

export function Reteach({ quizId }: { quizId: string }) {
  const [ctx] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    const all = quiz ? await store.sheets(quiz.id) : [];
    const sheets = all.filter((s) => s.status === 'read' || s.status === 'checked');
    return { quiz, cls, sheets, total: all.length, saved: quiz ? await store.plan(quiz.id) : undefined };
  }, [quizId]);
  const d = useDevice();
  const [langs, setLangs] = useState<Lang[]>(['en', 'hi']);
  const [keepLocal, setKeepLocal] = useState(false);
  const [plan, setPlan] = useState<PlanRec | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ msg: string; detail?: string } | null>(null);
  const [showText, setShowText] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!busy) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [busy]);
  const planHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (ctx?.saved) setPlan(ctx.saved); }, [ctx?.saved]);
  useEffect(() => { if (d.state !== 'available') setKeepLocal(false); }, [d.state]);
  useEffect(() => { if (ctx?.cls) setRosterTokens(rosterTokens(ctx.cls.roster.map((s) => s.name))); }, [ctx?.cls]);
  const build = (quiz: QuizRec, sheets: SheetRec[], names: string[]) =>
    buildTotals(quiz.keys, sheets, currentSettings().minGroupSize, keepLocal ? ['en'] : langs, { subject: quiz.subject ?? subjectFor(quiz.keys), grade_band: quiz.gradeBand ?? '7-9', rosterTokens: rosterTokens(names) });
  const totals: ClassTotals | null = useMemo(() => (ctx?.quiz && ctx.cls ? build(ctx.quiz, ctx.sheets, ctx.cls.roster.map((r) => r.name)) : null), [ctx, langs, keepLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ctx || !totals) return <p className="muted">Loading…</p>;
  const { quiz, cls, sheets } = ctx;
  if (!quiz || !cls) return <p>This quiz no longer exists.</p>;
  if (!sheets.length) return <div className="panel"><h2>Nothing to plan from yet</h2><p className="muted">Read and check some sheets first; the plan is written from the class totals.</p><a className="btn primary" href={href.scan(quizId)}>Go to the sheets</a></div>;
  const waiting = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const tooFew = sheets.length < MIN_SHEETS;
  const deviceReady = d.state === 'available';

  const send = async () => {
    setBusy(true); setErr(null); setStartedAt(Date.now()); setNow(Date.now());
    try {
      const fresh = build(quiz, sheets, cls.roster.map((r) => r.name)); // rebuilt with the settings in force when it is sent
      const r = await planFromTotals(fresh, { sample: !!cls.sample, sampleClass: sampleKeyOfClass(cls.id) ?? undefined, keepLocal, minK: currentSettings().minGroupSize, sheets: sheets.length });
      const rec: PlanRec = { quizId, at: Date.now(), payload: r.payload, response: r.response, where: r.where, ms: r.ms, heldBack: r.heldBack, note: r.note, mode: String(r.mode), cloudTried: r.cloudTried };
      await store.putPlan(rec);
      setPlan(rec);
      setTimeout(() => planHeading.current?.focus(), 50);
    } catch (e) {
      setErr(e instanceof PlanUnavailable ? { msg: e.message, detail: e.detail } : { msg: "The plan couldn't be written just now. Try again.", detail: (e as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <>
      {ctx.total > sheets.length && <Notice>{sheets.length} of {ctx.total} sheets are read so far, and the plan uses only those. <a href={href.scan(quizId)}>Read the rest</a> first for a fuller picture.</Notice>}

      <section className="panel noprint" aria-labelledby="send-h">
        <div className="panel-head">
          <h2 id="send-h">What would leave this laptop</h2>
          <span className="pill cloud"><i />{keepLocal ? 'Nothing: Gemini Nano plans it here' : 'Class totals only'}</span>
        </div>
        <p className="muted">This table is all the class data in the message: no names, photos or pupils' words, and small groups are hidden. The rest of the message is fixed instructions. Your own key text is included so the plan can teach it; any line naming someone on your class list is left out.</p>
        {waiting > 0 && <Notice tone="warn"><p>{waiting} mark{waiting === 1 ? ' is' : 's are'} still in pencil or flagged and won't be counted. <a href={href.check(quizId)}>Decide them</a> for complete totals.</p></Notice>}
        <div style={{ overflowX: 'auto' }}>
          <table className="plain">
            <thead><tr><th>Q</th><th>Type</th><th>Question and key</th><th>Full</th><th>Some</th><th>None</th><th>Mistakes</th></tr></thead>
            <tbody>
              {totals.questions.map((q) => (
                <tr key={q.q}>
                  <td className="hand" style={{ color: 'var(--red)', fontWeight: 700 }}>{q.q}</td>
                  <td className="small">{QTYPES[q.type].label}</td>
                  <td className="small">{q.question || <span className="quiet">(question not sent)</span>}{q.answer ? <> · <b>{q.answer}</b></> : null}{q.key_points?.length ? <div className="quiet">{q.key_points.map((p, i) => p ? `${i + 1}. ${p}` : `${i + 1}. (left out: names someone)`).join('  ')}</div> : null}{q.rubric?.length ? <div className="quiet">{q.rubric.join(' · ')}</div> : null}</td>
                  <td><C c={q.right} /></td><td><C c={q.partial} /></td><td><C c={q.wrong} /></td>
                  <td className="small">
                    {Object.keys(q.mistakes).length === 0 && !q.wrong_options ? <span className="quiet">{q.wrong === 0 && q.partial === 0 ? 'none' : 'breakdown withheld (small groups)'}</span> : Object.entries(q.mistakes).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}>{mistakeLabel(k, q.key_points ?? [], (q.rubric ?? []).map((r) => r.replace(/ \(\d+\)$/, '')))}: <C c={v!} /></span>)}
                    {q.wrong_options && Object.entries(q.wrong_options).map(([o, v]) => <span key={o} style={{ marginRight: 10 }}>picked {o}: <C c={v!} /></span>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="tiny muted mt">The class size isn't sent. <span className="hidden-cell">hidden</span> means fewer than {totals.k} pupils, or a breakdown that would let someone work a small group out. Blank and undecided answers aren't sent.</p>
        {deviceReady && (
          <label className="check-line small mt">
            <input type="checkbox" checked={keepLocal} onChange={(e) => setKeepLocal(e.target.checked)} />
            Keep it on this laptop: Gemini Nano writes the plan here (English notes only; nothing is sent).
          </label>
        )}
        {!keepLocal && (
          <fieldset className="row mt" style={{ border: 0, padding: 0 }}>
            <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Parent notes in</legend>
            {(['en', 'hi', 'ta'] as Lang[]).map((l) => (
              <label key={l} className="check-line"><input type="checkbox" checked={langs.includes(l)} disabled={l === 'en'} onChange={(e) => setLangs(e.target.checked ? [...langs, l] : langs.filter((x) => x !== l))} />{LANG_NAME[l]}</label>
            ))}
          </fieldset>
        )}
        <div className="row mt">
          <button className="btn primary" disabled={busy || tooFew} onClick={send}>
            {busy ? 'Planning…' : keepLocal ? 'Plan the lesson on this laptop' : plan ? 'Send the class totals again' : 'Send the class totals and plan the lesson'}
          </button>
          <button className="btn quiet" onClick={() => setShowText(!showText)} aria-expanded={showText}>{showText ? 'Hide' : 'Show'} the exact text {keepLocal ? 'Gemini Nano gets' : 'that is sent'}</button>
          {tooFew && <span className="muted small">Needs at least {MIN_SHEETS} marked sheets, so totals can't point to one child.</span>}
        </div>
        <p className="small muted" aria-live="polite" style={{ minHeight: '1.5em', marginTop: 8 }}>
          {busy ? `${keepLocal ? 'Gemini Nano is writing the plan on this laptop' : 'Cloud Gemini is writing the plan from the class totals'} · ${Math.max(0, Math.round((now - (startedAt ?? now)) / 1000))} s${keepLocal ? ' (usually 15-60 s, at most 2 minutes)' : deviceReady ? " (usually 6-17 s; if the cloud can't answer, Gemini Nano takes over here)" : ' (usually 6-17 s)'}` : ''}
        </p>
        {showText && <pre className="json">{totalsPrompt(totals, keepLocal)}</pre>}
        {err && <Notice tone="bad"><p>{err.msg}</p>{err.detail && <details className="small"><summary>Details</summary>{err.detail}</details>}</Notice>}
      </section>

      {plan && <PlanView key={plan.at} plan={plan} headingRef={planHeading} sheets={sheets} quiz={quiz} rosterName={(id) => cls.roster.find((r) => r.id === id)?.name ?? 'your child'} />}
    </>
  );
}

const C = ({ c }: { c: Cell }) => (typeof c === 'string' ? <span className="hidden-cell">{c}</span> : <>{c}</>);

/** Replaces any internal mistake id that slipped into AI text with its plain label. */
// only snake_case ids: "spelling" or "rounding" in a sentence is ordinary English, not an id
const IDS = new RegExp(`\\b(${Object.keys(MISTAKES).filter((k) => k.includes('_')).join('|')})\\b`, 'g');
const plain = (t: string) => (t ?? '').replace(IDS, (m) => `"${mistakeLabel(m).toLowerCase()}"`);

/** Checks a maths practice item with Tickmark's own fraction engine. */
export function verifyPractice(p: PracticeItem): { state: 'verified' | 'fixed' | 'unchecked'; answer: string } {
  const e = extractExpr(p.question.replace(/[=?]\s*$/, '').trim());
  if (!e) return { state: 'unchecked', answer: p.answer };
  try {
    const v = evaluate(e);
    const a = parse(p.answer);
    if (a.kind === 'value' && eq(a.value, v)) return { state: 'verified', answer: p.answer };
    return { state: 'fixed', answer: format(v) };
  } catch { return { state: 'unchecked', answer: p.answer }; }
}

function PlanView({ plan: rec, headingRef, sheets, quiz, rosterName }: { plan: PlanRec; headingRef: React.RefObject<HTMLHeadingElement | null>; sheets: SheetRec[]; quiz: QuizRec; rosterName: (id: string) => string }) {
  const plan: TotalsResponse = rec.response;
  const maths = (quiz.subject ?? subjectFor(quiz.keys)) === 'maths';
  const present = [...new Set((plan.notes ?? []).map((n) => n.language))].filter((l): l is Lang => l === 'en' || l === 'hi' || l === 'ta');
  const tabs: Lang[] = [...new Set<Lang>(['en', ...present])];
  const [lang, setLang] = useState<Lang>(tabs.includes('hi') ? 'hi' : 'en');
  const [toast, setToast] = useToast();
  const p = plan.plan;
  const tiers = [['support', 'Support'], ['core', 'Core'], ['stretch', 'Stretch']] as const;
  const checks = maths ? tiers.flatMap(([k]) => (p.practice?.[k] ?? []).map(verifyPractice)) : [];
  const verified = checks.filter((c) => c.state === 'verified').length;
  const fixed = checks.filter((c) => c.state === 'fixed').length;
  const hinge = p.hingeQuestion && maths ? verifyPractice({ question: p.hingeQuestion.question, answer: p.hingeQuestion.answer }) : null;

  const groupOf = (s: SheetRec): string => {
    const off = s.marks.filter((m) => m.status === 'wrong' || m.status === 'partial');
    if (!off.length) return s.marks.every((m) => m.status === 'correct') ? 'secure' : 'default';
    const counts = new Map<string, number>();
    off.forEach((m) => { for (const g of m.mistakes?.length ? m.mistakes : [m.misconception && m.misconception !== 'slip' && m.misconception !== 'wrong_operation' ? m.misconception : 'other']) counts.set(g, (counts.get(g) ?? 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  // own group, then "other", then "default" in the same language, then Tickmark's built-in English
  const template = (g: string, l: Lang): { text: string; fallback: 'none' | 'general' | 'english' } => {
    for (const [i, c] of [g, 'other', 'default'].entries()) {
      const t = plan.notes?.find((n) => n.group === c && n.language === l);
      if (t && validTemplate(t.text)) return { text: t.text, fallback: i === 0 ? 'none' : 'general' };
    }
    return { text: FALLBACK_NOTES[g] ?? FALLBACK_NOTES.default, fallback: 'english' };
  };
  // a note only goes to a confirmed name: an unsure match could send one child's score to another's parent
  const held = sheets.filter((s) => !s.studentId || !s.nameConfident).length;
  const slips = sheets.filter((s) => s.studentId && s.nameConfident).map((s) => {
    const sc = scoreSheet(s.marks, quiz.unsimplifiedCredit);
    const t = template(groupOf(s), lang);
    if (sc.unreadable + sc.pending) return { id: s.id, name: rosterName(s.studentId!), text: `${rosterName(s.studentId!)}: finish marking this sheet first (some marks are still waiting for you).`, fallback: 'none' as const };
    return { id: s.id, name: rosterName(s.studentId!), text: fillTemplate(t.text, { student: rosterName(s.studentId!), score: sc.points, total: sc.outOf }), fallback: t.fallback };
  });
  const english = slips.filter((s) => s.fallback === 'english').length;
  const printSlips = () => {
    document.body.classList.add('printing-slips');
    const off = () => { document.body.classList.remove('printing-slips'); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  };

  const recK = sampleKeyOfClass(quiz.classId);
  const recordedOn = (() => { const r = recK ? recordedInfo(recK) : null; return r ? dayOf(r.recordedAt) : 'an earlier date'; })();
  return (
    <>
      <section className="panel section" aria-labelledby="plan-h">
        <div className="panel-head">
          <h2 id="plan-h" ref={headingRef} tabIndex={-1}>{plain(p.title)}</h2>
          <WhereChip where={rec.where} ms={rec.ms} />
        </div>
        {rec.where === 'recorded' && <Notice>Live AI wasn't available ({rec.note ?? 'unknown reason'}). This plan was recorded for this made-up class on {recordedOn}.</Notice>}
        {rec.where === 'on_device' && (
          <Notice tone="device">
            {rec.cloudTried ? "Cloud Gemini couldn't finish (the class totals were sent), so Gemini Nano wrote this plan here." : rec.mode === 'only_on_device' ? 'Written on this laptop by Gemini Nano: nothing was sent.' : rec.heldBack ? `Tickmark held the cloud request back (${rec.heldBack}), so Gemini Nano wrote this plan here.` : "Cloud Gemini couldn't be reached, so Gemini Nano wrote this plan on this laptop."} Hindi and Tamil notes need the cloud.
          </Notice>
        )}
        <p className="lede">{plain(p.focus)} {p.minutes ? <span className="pill">About {p.minutes} min</span> : null}</p>
        <table className="plain"><thead><tr><th>Min</th><th>You</th><th>Pupils</th></tr></thead>
          <tbody>{p.steps?.map((s, i) => <tr key={i}><td className="num">{s.minutes}</td><td>{plain(s.teacher)}</td><td>{plain(s.students)}</td></tr>)}</tbody></table>
        {p.hingeQuestion && (
          <Notice>
            <p><b>Hinge question:</b> {p.hingeQuestion.question} <b>Answer:</b> {hinge?.answer ?? p.hingeQuestion.answer}
              {hinge?.state === 'verified' && <span className="verified"> checked by code</span>}{hinge?.state === 'fixed' && <span className="fixed"> (corrected by Tickmark; the AI wrote {p.hingeQuestion.answer})</span>}</p>
            <p className="small">{plain(p.hingeQuestion.ifWrong)}</p>
          </Notice>
        )}
        <h3 className="mt-l">Practice</h3>
        <p className="small">
          {maths
            ? <><span className="verified">{verified} of {checks.length} answers checked by Tickmark's own maths</span>{fixed > 0 && <span className="fixed">; {fixed} corrected (the AI's answer was wrong)</span>}.</>
            : <span className="muted">Model answers written by the AI. Read them before you hand them out.</span>}
        </p>
        <div className="row" style={{ alignItems: 'flex-start', gap: 28 }}>
          {tiers.map(([k, lbl]) => (
            <div key={k} className="grow" style={{ minWidth: 220 }}><h4 style={{ margin: '0 0 6px' }}>{lbl}</h4>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {(p.practice?.[k] ?? []).map((it, i) => { const v = maths ? verifyPractice(it) : { state: 'unchecked' as const, answer: it.answer }; return (
                  <li key={i} style={{ marginBottom: 4 }}>{it.question} <span className="muted">→ {v.answer}</span> {v.state === 'verified' ? <span className="verified" title="Checked by code"><Icon name="check" size={14} /></span> : v.state === 'fixed' ? <span className="fixed" title={`The AI wrote ${it.answer}`}>corrected</span> : null}</li>
                ); })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="panel section slips-section" aria-labelledby="notes-h">
        <div className="panel-head noprint">
          <h2 id="notes-h">Parent notes</h2>
          <div className="row">
            <button className="btn small" onClick={() => navigator.clipboard.writeText(slips.map((s) => s.text).join('\n\n')).then(() => setToast(`Copied ${slips.length} notes.`), () => setToast('Copying is blocked in this browser; select the text instead.'))}>Copy all</button>
            <button className="btn small" onClick={printSlips}>Print slips</button>
          </div>
        </div>
        <p className="muted small noprint">The AI wrote one template per mistake group, with placeholders. Each child's name and score were filled in here, on this laptop.</p>
        {tabs.length > 1 && <div className="tabs noprint" role="tablist" aria-label="Language">{tabs.map((l) => <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}>{LANG_NAME[l]}</button>)}</div>}
        {held > 0 && <Notice tone="warn">{held} note{held === 1 ? ' is' : 's are'} held back until you confirm the pupil's name in Check.</Notice>}
        {english > 0 && lang !== 'en' && <Notice>{english === 1 ? '1 note uses' : `${english} notes use`} Tickmark's built-in English text because no usable {LANG_NAME[lang]} template came back for that group.</Notice>}
        <div>
          {slips.map((s) => <div key={s.id} className="slip"><div className="small muted">{s.name}</div><div className="note" lang={s.fallback === 'english' ? 'en' : lang}>{s.text}</div></div>)}
        </div>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
