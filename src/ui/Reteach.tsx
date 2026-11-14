import { useEffect, useMemo, useRef, useState } from 'react';
import { currentSettings, ensureAppCheck } from '../ai/firebase';
import { setRosterTokens } from '../ai/netGuard';
import { totalsPrompt } from '../ai/prompts';
import type { PracticeItem, TotalsResponse } from '../ai/schemas';
import { planFromTotals, PlanUnavailable } from '../ai/tasks';
import { href } from '../app/router';
import { eq, evaluate, extractExpr, format, parse } from '../marking/fraction';
import { scoreSheet } from '../marking/mark';
import { MISCONCEPTIONS, type MisconceptionId } from '../marking/misconceptions';
import { needsCheck } from '../marking/pipeline';
import { buildTotals, MIN_SHEETS, type Cell, type ClassTotals, type Lang } from '../privacy/aggregate';
import { rosterTokens } from '../privacy/nameCheck';
import { FALLBACK_NOTES, fillTemplate, validTemplate } from '../privacy/templates';
import { store, type PlanRec, type SheetRec } from '../store/db';
import { useDevice, useLoad, useToast } from './hooks';
import { WhereChip } from './Marks';

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
  const planHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (ctx?.saved) setPlan(ctx.saved); }, [ctx?.saved]);
  useEffect(() => { if (navigator.onLine) ensureAppCheck(); }, []); // a cloud request may follow on this page
  useEffect(() => { if (ctx?.cls) setRosterTokens(rosterTokens(ctx.cls.roster.map((s) => s.name))); }, [ctx?.cls]);
  const totals: ClassTotals | null = useMemo(() => (ctx?.quiz ? buildTotals(ctx.quiz.keys, ctx.sheets, currentSettings().minGroupSize, keepLocal ? ['en'] : langs) : null), [ctx, langs, keepLocal]);

  if (!ctx || !totals) return <p className="muted">Loading…</p>;
  const { quiz, cls, sheets } = ctx;
  if (!quiz || !cls) return <p>This quiz no longer exists.</p>;
  const flagsLeft = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const tooFew = sheets.length < MIN_SHEETS;
  const deviceReady = d.state === 'available';

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await planFromTotals(totals, { sample: !!cls.sample, keepLocal: keepLocal && deviceReady, minK: currentSettings().minGroupSize });
      const rec: PlanRec = { quizId, at: Date.now(), payload: r.payload, response: r.response, where: r.where, ms: r.ms, heldBack: r.heldBack, note: r.note, mode: String(r.mode) };
      await store.putPlan(rec);
      setPlan(rec);
      setTimeout(() => planHeading.current?.focus(), 50);
    } catch (e) {
      setErr(e instanceof PlanUnavailable ? { msg: e.message, detail: e.detail } : { msg: 'The plan could not be written just now. Try again.', detail: (e as Error).message });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><span className="muted small">{cls.name}, {quiz.title}</span><h1 style={{ margin: 0 }}>Plan tomorrow's lesson</h1></div>
        <a className="btn noprint" href={href.results(quizId)}>Back to results</a>
      </div>

      {ctx.total > sheets.length && <p className="callout noprint" style={{ marginTop: 12 }}>{sheets.length} of {ctx.total} sheets are read so far. The plan uses only those. <a href={href.scan(quizId)}>Read the rest</a> first for a fuller picture.</p>}

      <section className="sheet section noprint">
        <h2>Before you send</h2>
        <p className="muted">This table is all the class data in the message: no names, photos or individual answers, and small groups are hidden. The rest of the message is fixed instructions. Gemini turns it into a short lesson and parent-note templates.</p>
        {flagsLeft > 0 && <p className="callout small">{flagsLeft} answers are still flagged. You can send now, but the totals are more accurate after <a href={href.check(quizId)}>checking them</a>.</p>}
        <div style={{ overflowX: 'auto' }}>
          <table className="plain">
            <thead><tr><th>Q</th><th>Question</th><th>Right</th><th>Not simplified</th><th>Wrong</th><th>Blank</th><th>Mistakes found</th></tr></thead>
            <tbody>
              {totals.questions.map((q) => (
                <tr key={q.q}>
                  <td>{q.q}</td><td>{q.question ? `${q.question} = ${q.answer}` : <span className="muted">(not sent)</span>}</td>
                  <td><C c={q.correct} /></td><td><C c={q.unsimplified} /></td><td><C c={q.wrong} /></td><td><C c={q.blank} /></td>
                  <td className="small">{Object.keys(q.mistakes).length === 0 ? <span className="muted">none</span> : Object.entries(q.mistakes).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}>{label(k)}: <C c={v!} /></span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}><span className="hidden-cell">hidden</span> means fewer than {totals.k} students, or a number that would let someone work one out. Nobody can be singled out.</p>
        {deviceReady && (
          <label className="row small" style={{ gap: 8, margin: '12px 0 0' }}>
            <input type="checkbox" checked={keepLocal} onChange={(e) => setKeepLocal(e.target.checked)} />
            Keep this on the laptop: Gemini Nano writes the plan here (English notes only; nothing is sent).
          </label>
        )}
        {!keepLocal && (
          <fieldset className="row" style={{ border: 0, padding: 0, margin: '12px 0' }}>
            <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Parent notes in</legend>
            {(['en', 'hi', 'ta'] as Lang[]).map((l) => (
              <label key={l} className="row" style={{ gap: 6 }}>
                <input type="checkbox" checked={langs.includes(l)} disabled={l === 'en'} onChange={(e) => setLangs(e.target.checked ? [...langs, l] : langs.filter((x) => x !== l))} />{LANG_NAME[l]}
              </label>
            ))}
          </fieldset>
        )}
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" disabled={busy || tooFew} onClick={send}>
            {busy ? 'Planning…' : keepLocal ? 'Plan the lesson on this laptop' : plan ? 'Send class totals again' : 'Send class totals and plan the lesson'}
          </button>
          <button className="btn ghost" onClick={() => setShowText(!showText)}>{showText ? 'Hide' : 'Show'} the exact text {keepLocal ? 'Gemini Nano gets' : 'that is sent'}</button>
          {tooFew && <span className="muted small">Needs at least {MIN_SHEETS} marked sheets so totals can't point to one child.</span>}
        </div>
        <p className="small muted" aria-live="polite" style={{ minHeight: '1.5em', marginTop: 8 }}>
          {busy ? (keepLocal ? 'Gemini Nano is writing the plan on this laptop (up to 2 minutes)…' : `Asking cloud Gemini…${deviceReady ? ' If it can\'t be reached, Gemini Nano writes the plan here instead (up to 2 minutes).' : ''}`) : ''}
        </p>
        {showText && <pre className="json">{totalsPrompt(totals, keepLocal)}</pre>}
        {err && (
          <div className="callout bad" role="alert" style={{ marginTop: 12 }}>
            {err.msg}
            {err.detail && <details className="small"><summary>Details</summary>{err.detail}</details>}
          </div>
        )}
      </section>

      {plan && <PlanView plan={plan} headingRef={planHeading} sheets={sheets} rosterName={(id) => cls.roster.find((r) => r.id === id)?.name ?? 'your child'} credit={quiz.unsimplifiedCredit} />}
    </>
  );
}

const C = ({ c }: { c: Cell }) => (typeof c === 'string' ? <span className="hidden-cell">{c}</span> : <>{c}</>);
const label = (k: string) => (k in MISCONCEPTIONS ? MISCONCEPTIONS[k as MisconceptionId].label : k === 'other' ? 'Other' : k);

/** Replaces any internal mistake id that slipped into AI text with its plain label. */
const plain = (t: string) => (t ?? '').replace(/\b(add_across|numerators_only|denominators_multiplied|whole_dropped|cross_multiply|no_invert|flipped_first|reversed_subtraction|wrong_operation)\b/g, (m) => `"${MISCONCEPTIONS[m as MisconceptionId].label.toLowerCase()}"`);

/** Checks a practice item with Tickmark's own fraction engine. */
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

function PlanView({ plan: rec, headingRef, sheets, rosterName, credit }: { plan: PlanRec; headingRef: React.RefObject<HTMLHeadingElement | null>; sheets: SheetRec[]; rosterName: (id: string) => string; credit: number }) {
  const plan: TotalsResponse = rec.response;
  const present = [...new Set((plan.notes ?? []).map((n) => n.language))].filter((l): l is Lang => l === 'en' || l === 'hi' || l === 'ta');
  const tabs: Lang[] = [...new Set<Lang>(['en', ...present])];
  const [lang, setLang] = useState<Lang>(tabs.includes('hi') ? 'hi' : 'en');
  const [toast, setToast] = useToast();
  const p = plan.plan;
  const tiers = [['support', 'Support'], ['core', 'Core'], ['stretch', 'Stretch']] as const;
  const checks = tiers.flatMap(([k]) => (p.practice?.[k] ?? []).map(verifyPractice));
  const verified = checks.filter((c) => c.state === 'verified').length;
  const fixed = checks.filter((c) => c.state === 'fixed').length;
  const hinge = p.hingeQuestion ? verifyPractice({ question: p.hingeQuestion.question, answer: p.hingeQuestion.answer }) : null;

  const groupOf = (s: SheetRec): string => {
    const wrong = s.marks.filter((m) => m.status === 'wrong');
    if (!wrong.length) return s.marks.every((m) => m.status === 'correct') ? 'secure' : 'default';
    const counts = new Map<string, number>();
    wrong.forEach((m) => { const g = m.misconception && m.misconception !== 'slip' && m.misconception !== 'wrong_operation' ? m.misconception : 'other'; counts.set(g, (counts.get(g) ?? 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  // own group, then "other", then "default" in the same language, then Tickmark's built-in English
  const template = (g: string, l: Lang): { text: string; fallback: 'none' | 'general' | 'english' } => {
    const chain = [g, 'other', 'default'];
    for (const [i, c] of chain.entries()) {
      const t = plan.notes?.find((n) => n.group === c && n.language === l);
      if (t && validTemplate(t.text)) return { text: t.text, fallback: i === 0 ? 'none' : 'general' };
    }
    return { text: FALLBACK_NOTES[g] ?? FALLBACK_NOTES.default, fallback: 'english' };
  };
  const slips = sheets.filter((s) => s.studentId).map((s) => {
    const sc = scoreSheet(s.marks, credit);
    const t = template(groupOf(s), lang);
    return { id: s.id, name: rosterName(s.studentId!), text: fillTemplate(t.text, { student: rosterName(s.studentId!), score: sc.points, total: sc.outOf }), fallback: t.fallback };
  });
  const english = slips.filter((s) => s.fallback === 'english').length;
  const printSlips = () => {
    document.body.classList.add('printing-slips');
    const off = () => { document.body.classList.remove('printing-slips'); removeEventListener('afterprint', off); };
    addEventListener('afterprint', off);
    window.print();
  };

  return (
    <>
      <section className="sheet section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 ref={headingRef} tabIndex={-1} style={{ margin: 0 }}>{plain(p.title)}</h2>
          <WhereChip where={rec.where} ms={rec.ms} />
        </div>
        {rec.where === 'recorded' && <p className="callout small" style={{ marginTop: 8 }}>Live AI wasn't available ({rec.note ?? 'unknown reason'}). This plan was recorded on 15 Nov for the full 28-sheet sample class.</p>}
        {rec.where === 'on_device' && (
          <p className="callout device small" style={{ marginTop: 8 }}>
            {rec.mode === 'only_on_device' ? 'Written on this laptop by Gemini Nano: nothing was sent.' : rec.heldBack ? `Tickmark held the cloud request back (${rec.heldBack}), so Gemini Nano wrote this plan here.` : 'Cloud Gemini could not be reached, so Gemini Nano wrote this plan on this laptop.'} Hindi and Tamil notes need the cloud.
          </p>
        )}
        <p className="muted">{plain(p.focus)} {p.minutes ? `About ${p.minutes} minutes.` : ''}</p>
        <table className="plain"><thead><tr><th>Min</th><th>You</th><th>Students</th></tr></thead>
          <tbody>{p.steps?.map((s, i) => <tr key={i}><td>{s.minutes}</td><td>{plain(s.teacher)}</td><td>{plain(s.students)}</td></tr>)}</tbody></table>
        {p.hingeQuestion && (
          <div className="callout section">
            <b>Hinge question:</b> {p.hingeQuestion.question} <b>Answer:</b> {hinge?.answer ?? p.hingeQuestion.answer}
            {hinge?.state === 'verified' && <span className="verified"> ✓</span>}{hinge?.state === 'fixed' && <span className="fixed"> (corrected by Tickmark; the AI wrote {p.hingeQuestion.answer})</span>}
            <div className="small">{plain(p.hingeQuestion.ifWrong)}</div>
          </div>
        )}
        <h3 className="section">Practice</h3>
        <p className="small">
          <span className="verified">{verified} of {checks.length} answers checked by Tickmark's fraction engine</span>
          {fixed > 0 && <span className="fixed">; {fixed} corrected (the AI's answer was wrong)</span>}.
        </p>
        <div className="grid2">
          {tiers.map(([k, lbl]) => (
            <div key={k}><h4 style={{ margin: '0 0 6px' }}>{lbl}</h4>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {(p.practice?.[k] ?? []).map((it, i) => { const v = verifyPractice(it); return (
                  <li key={i}>{it.question} <span className="muted">= {v.answer}</span> {v.state === 'verified' ? <span className="verified" title="Checked by code">✓</span> : v.state === 'fixed' ? <span className="fixed" title={`The AI wrote ${it.answer}`}>corrected</span> : null}</li>
                ); })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="sheet section slips-section">
        <div className="row noprint" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Parent notes</h2>
          <div className="row">
            <button className="btn small" onClick={() => navigator.clipboard.writeText(slips.map((s) => s.text).join('\n\n')).then(() => setToast(`Copied ${slips.length} notes.`), () => setToast('Copying is blocked in this browser; select the text instead.'))}>Copy all</button>
            <button className="btn small" onClick={printSlips}>Print slips</button>
          </div>
        </div>
        <p className="muted small noprint">The AI wrote one template per mistake group, with placeholders. Each child's name and score were filled in here, on this laptop.</p>
        {tabs.length > 1 && <div className="tabs noprint" role="tablist">{tabs.map((l) => <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}>{LANG_NAME[l]}</button>)}</div>}
        {english > 0 && lang !== 'en' && <p className="callout small noprint">{english === 1 ? '1 note uses' : `${english} notes use`} Tickmark's built-in English text because no usable {LANG_NAME[lang]} template came back for that group.</p>}
        <div className="stack">
          {slips.map((s) => <div key={s.id} className="slip"><div className="small muted">{s.name}</div><div className="note" lang={s.fallback === 'english' ? 'en' : lang}>{s.text}</div></div>)}
        </div>
      </section>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}
