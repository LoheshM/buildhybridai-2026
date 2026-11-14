import { useEffect, useMemo, useState } from 'react';
import { currentSettings } from '../ai/firebase';
import { setRosterTokens } from '../ai/netGuard';
import type { PracticeItem, TotalsResponse } from '../ai/schemas';
import { planFromTotals } from '../ai/tasks';
import { href } from '../app/router';
import { eq, evaluate, format, parse, parseExpr } from '../marking/fraction';
import { scoreSheet } from '../marking/mark';
import { MISCONCEPTIONS, type MisconceptionId } from '../marking/misconceptions';
import { needsCheck } from '../marking/pipeline';
import { buildTotals, MIN_SHEETS, type Cell, type ClassTotals, type Lang } from '../privacy/aggregate';
import { rosterTokens } from '../privacy/nameCheck';
import { FALLBACK_NOTES, fillTemplate, validTemplate } from '../privacy/templates';
import { store, type PlanRec, type SheetRec } from '../store/db';
import { useLoad } from './hooks';
import { WhereChip } from './Marks';

const LANG_NAME: Record<Lang, string> = { en: 'English', hi: 'Hindi', ta: 'Tamil' };

export function Reteach({ quizId }: { quizId: string }) {
  const [ctx] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    const sheets = quiz ? (await store.sheets(quiz.id)).filter((s) => s.status === 'read' || s.status === 'checked') : [];
    return { quiz, cls, sheets, saved: quiz ? await store.plan(quiz.id) : undefined };
  }, [quizId]);
  const [langs, setLangs] = useState<Lang[]>(['en', 'hi']);
  const [plan, setPlan] = useState<PlanRec | undefined>();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  useEffect(() => { if (ctx?.saved) setPlan(ctx.saved); }, [ctx?.saved]);
  useEffect(() => { if (ctx?.cls) setRosterTokens(rosterTokens(ctx.cls.roster.map((s) => s.name))); }, [ctx?.cls]);
  const totals: ClassTotals | null = useMemo(() => (ctx?.quiz ? buildTotals(ctx.quiz.keys, ctx.sheets, currentSettings().minGroupSize, langs) : null), [ctx, langs]);

  if (!ctx || !totals) return <p className="muted">Loading…</p>;
  const { quiz, cls, sheets } = ctx;
  if (!quiz || !cls) return <p>This quiz no longer exists.</p>;
  const flagsLeft = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const tooFew = sheets.length < MIN_SHEETS;

  const send = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await planFromTotals(totals);
      const rec: PlanRec = { quizId, at: Date.now(), payload: totals, response: r.response, where: r.where, ms: r.ms };
      await store.putPlan(rec);
      setPlan(rec);
    } catch (e) {
      setErr((e as Error).name === 'DeviceUnavailable' ? 'The cloud is not reachable and this laptop has no on-device AI to fall back on. Try again in a minute.' : (e as Error).message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div><span className="muted small">{cls.name}, {quiz.title}</span><h1 style={{ margin: 0 }}>Plan tomorrow's lesson</h1></div>
        <a className="btn noprint" href={href.results(quizId)}>Back to results</a>
      </div>

      <section className="sheet section noprint">
        <h2>Before you send</h2>
        <p className="muted">This table is the whole message. No names, photos or individual answers: only class totals, with small numbers hidden. Gemini in the cloud turns it into a lesson and parent-note templates.</p>
        {flagsLeft > 0 && <p className="callout small">{flagsLeft} answers are still flagged. You can send now, but the totals are more accurate after <a href={href.check(quizId)}>checking them</a>.</p>}
        <div style={{ overflowX: 'auto' }}>
          <table className="plain">
            <thead><tr><th>Q</th><th>Question</th><th>Right</th><th>Not simplified</th><th>Wrong</th><th>Blank</th><th>Mistakes found</th></tr></thead>
            <tbody>
              {totals.questions.map((q) => (
                <tr key={q.q}>
                  <td>{q.q}</td><td>{q.question ? `${q.question} = ${q.answer}` : <span className="muted">(not sent)</span>}</td>
                  <td><C c={q.correct} /></td><td><C c={q.unsimplified} /></td><td><C c={q.wrong} /></td><td><C c={q.blank} /></td>
                  <td className="small">{Object.entries(q.mistakes).map(([k, v]) => <span key={k} style={{ marginRight: 10 }}>{k === 'other' ? 'other' : MISCONCEPTIONS[k as MisconceptionId].label}: <C c={v!} /></span>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: 8 }}><span className="hidden-cell">hidden</span> means fewer than {totals.k} students, or a number that would let someone work one out. Nobody can be singled out.</p>
        <fieldset className="row" style={{ border: 0, padding: 0, margin: '12px 0' }}>
          <legend className="small" style={{ fontWeight: 700, marginBottom: 6 }}>Parent notes in</legend>
          {(['en', 'hi', 'ta'] as Lang[]).map((l) => (
            <label key={l} className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={langs.includes(l)} disabled={l === 'en'} onChange={(e) => setLangs(e.target.checked ? [...langs, l] : langs.filter((x) => x !== l))} />{LANG_NAME[l]}
            </label>
          ))}
        </fieldset>
        <div className="row">
          <button className="btn primary" disabled={busy || tooFew} onClick={send}>{busy ? 'Planning…' : plan ? 'Send again and re-plan' : 'Send class totals and plan the lesson'}</button>
          <button className="btn ghost" onClick={() => setShowJson(!showJson)}>{showJson ? 'Hide' : 'Show'} the exact request</button>
          {tooFew && <span className="muted small">Needs at least {MIN_SHEETS} marked sheets so totals can't point to one child.</span>}
        </div>
        {showJson && <pre className="json">{JSON.stringify(totals, null, 1)}</pre>}
        {err && <p className="callout bad" role="alert" style={{ marginTop: 12 }}>{err}</p>}
      </section>

      {plan && <PlanView plan={plan.response} where={plan.where} ms={plan.ms} sheets={sheets} rosterName={(id) => cls.roster.find((r) => r.id === id)?.name ?? 'your child'} credit={quiz.unsimplifiedCredit} langs={plan.payload.note_languages} />}
    </>
  );
}

const C = ({ c }: { c: Cell }) => (typeof c === 'string' ? <span className="hidden-cell">{c}</span> : <>{c}</>);

/** Checks a practice item with Tickmark's own fraction engine. */
export function verifyPractice(p: PracticeItem): { state: 'verified' | 'fixed' | 'unchecked'; answer: string } {
  const e = parseExpr(p.question.replace(/[=?]\s*$/, '').trim());
  if (!e) return { state: 'unchecked', answer: p.answer };
  try {
    const v = evaluate(e);
    const a = parse(p.answer);
    if (a.kind === 'value' && eq(a.value, v)) return { state: 'verified', answer: p.answer };
    return { state: 'fixed', answer: format(v) };
  } catch { return { state: 'unchecked', answer: p.answer }; }
}

function PlanView({ plan, where, ms, sheets, rosterName, credit, langs }: { plan: TotalsResponse; where: PlanRec['where']; ms: number; sheets: SheetRec[]; rosterName: (id: string) => string; credit: number; langs: Lang[] }) {
  const [lang, setLang] = useState<Lang>(langs.includes('hi') ? 'hi' : 'en');
  const p = plan.plan;
  const tiers = [['support', 'Support'], ['core', 'Core'], ['stretch', 'Stretch']] as const;
  const checks = tiers.flatMap(([k]) => (p.practice?.[k] ?? []).map(verifyPractice));
  const verified = checks.filter((c) => c.state === 'verified').length;
  const fixed = checks.filter((c) => c.state === 'fixed').length;

  const groupOf = (s: SheetRec): string => {
    const wrong = s.marks.filter((m) => m.status === 'wrong');
    if (!wrong.length) return s.marks.every((m) => m.status === 'correct') ? 'secure' : 'default';
    const counts = new Map<string, number>();
    wrong.forEach((m) => counts.set(m.misconception ?? 'default', (counts.get(m.misconception ?? 'default') ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };
  const template = (g: string, l: Lang): { text: string; fallback: boolean } => {
    // the child's own group first, then the generic "other" note in the same language, then built-in English
    const candidates = [g, g === 'default' ? 'other' : '', g !== 'secure' ? 'other' : ''].filter(Boolean);
    for (const c of candidates) {
      const t = plan.notes?.find((n) => n.group === c && n.language === l);
      if (t && validTemplate(t.text)) return { text: t.text, fallback: false };
    }
    return { text: FALLBACK_NOTES[g] ?? FALLBACK_NOTES.default, fallback: true };
  };
  const slips = sheets.filter((s) => s.studentId).map((s) => {
    const sc = scoreSheet(s.marks, credit);
    const t = template(groupOf(s), lang);
    return { id: s.id, name: rosterName(s.studentId!), text: fillTemplate(t.text, { student: rosterName(s.studentId!), score: sc.points, total: sc.outOf }), fallback: t.fallback };
  });
  const fallbacks = slips.filter((s) => s.fallback).length;

  return (
    <>
      <section className="sheet section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{p.title}</h2>
          <WhereChip where={where} ms={ms} />
        </div>
        {where === 'on_device' && <p className="callout device small" style={{ marginTop: 8 }}>The cloud was not reachable, so Gemini Nano wrote this plan on this laptop. Parent notes are in English only.</p>}
        <p className="muted">{p.focus} {p.minutes ? `About ${p.minutes} minutes.` : ''}</p>
        <table className="plain"><thead><tr><th>Min</th><th>You</th><th>Students</th></tr></thead>
          <tbody>{p.steps?.map((s, i) => <tr key={i}><td>{s.minutes}</td><td>{s.teacher}</td><td>{s.students}</td></tr>)}</tbody></table>
        {p.hingeQuestion && <div className="callout section"><b>Hinge question:</b> {p.hingeQuestion.question} <b>Answer:</b> {p.hingeQuestion.answer}<div className="small">{p.hingeQuestion.ifWrong}</div></div>}
        <h3 className="section">Practice</h3>
        <p className="small">
          <span className="verified">{verified} answers checked by Tickmark's fraction engine</span>
          {fixed > 0 && <span className="fixed">, {fixed} corrected (the AI's answer was wrong)</span>}.
        </p>
        <div className="grid2">
          {tiers.map(([k, label]) => (
            <div key={k}><h4 style={{ margin: '0 0 6px' }}>{label}</h4>
              <ol style={{ margin: 0, paddingLeft: 20 }}>
                {(p.practice?.[k] ?? []).map((it, i) => { const v = verifyPractice(it); return (
                  <li key={i}>{it.question} <span className="muted">= {v.answer}</span> {v.state === 'verified' ? <span className="verified" title="Checked by code">✓</span> : v.state === 'fixed' ? <span className="fixed" title={`The AI wrote ${it.answer}`}>corrected</span> : null}</li>
                ); })}
              </ol>
            </div>
          ))}
        </div>
      </section>

      <section className="sheet section">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Parent notes</h2>
          <div className="row noprint">
            <button className="btn small" onClick={() => navigator.clipboard.writeText(slips.map((s) => s.text).join('\n\n'))}>Copy all</button>
            <button className="btn small" onClick={() => window.print()}>Print slips</button>
          </div>
        </div>
        <p className="muted small noprint">The cloud wrote one template per mistake group with placeholders. Each child's name and score were filled in here, on this laptop.</p>
        <div className="tabs noprint" role="tablist">{langs.map((l) => <button key={l} role="tab" aria-selected={lang === l} onClick={() => setLang(l)}>{LANG_NAME[l]}</button>)}</div>
        {fallbacks > 0 && <p className="callout small noprint">{fallbacks === 1 ? '1 note uses' : `${fallbacks} notes use`} Tickmark's built-in English text because the cloud template failed a placeholder check.</p>}
        <div className="stack">
          {slips.map((s) => <div key={s.id} className="slip"><div className="small muted">{s.name}</div><div className="note" lang={s.fallback ? 'en' : lang}>{s.text}</div></div>)}
        </div>
      </section>
    </>
  );
}
