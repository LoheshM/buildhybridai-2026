import { useEffect, useMemo, useState } from 'react';
import { go, href } from '../app/router';
import { SAMPLES, sampleManifest, type SampleKey } from '../app/boot';
import { keyProblem, outOfFor, typeOf, type QuestionKey } from '../marking/mark';
import { detectType, keyPoints, parseRubric, QTYPES, type QType } from '../marking/qtypes';
import { parseRoster } from '../marking/roster';
import { GRADE_BANDS, SUBJECTS, type GradeBand, type Subject } from '../privacy/aggregate';
import { store, uid, type ClassRec, type QuizRec } from '../store/db';
import { useLoad } from './hooks';
import { sheetFit } from '../img/sheet';
import { Notice } from './App';

interface Row { prompt: string; answer: string; type: QType | 'auto'; spelling: boolean }
const EMPTY: Row = { prompt: '', answer: '', type: 'auto', spelling: false };
const SUBJECT_NAME: Record<Subject, string> = { maths: 'Maths', science: 'Science', english: 'English', other: 'Other' };
const GRADE_NAME: Record<GradeBand, string> = { '4-6': 'Grades 4 to 6 (ages 9 to 12)', '7-9': 'Grades 7 to 9 (ages 12 to 15)', '10-12': 'Grades 10 to 12 (ages 15 to 18)' };

export function NewQuiz() {
  const [classes] = useLoad(async () => (await store.classes()).filter((c) => !c.sample), []);
  const [classId, setClassId] = useState<string>('new');
  const [className, setClassName] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState<Subject | 'auto'>('auto');
  const [grade, setGrade] = useState<GradeBand>('7-9');
  const [rows, setRows] = useState<Row[]>([EMPTY, EMPTY, EMPTY]);
  const [credit, setCredit] = useState(0.5);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setError(null); }, [rows, title, className, rosterText]); // an error is about what was there when Save was pressed
  const [extract, setExtract] = useState('');

  const roster = useMemo(() => parseRoster(rosterText), [rosterText]);
  const skipped = useMemo(() => rosterText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 60), [rosterText]);
  const filled = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.prompt.trim() || r.answer.trim());
  const keys: QuestionKey[] = filled.map(({ r }, n) => ({
    q: n + 1, prompt: r.prompt.trim(), answer: r.answer.trim(),
    ...(r.type !== 'auto' ? { type: r.type } : {}),
    ...(r.spelling ? { spellingCounts: true } : {}),
  }));
  const problemOf = (i: number) => { const n = filled.findIndex((f) => f.i === i); return n >= 0 ? keyProblem(keys[n]) : null; };
  const set = (i: number, p: Partial<Row>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const applyTemplate = (k: SampleKey) => {
    const m = sampleManifest(k);
    if (!m) return;
    setTitle(m.quiz.title);
    setSubject(m.quiz.subject);
    setGrade(m.quiz.grade_band);
    setExtract(m.quiz.extract ?? '');
    setRows(m.quiz.questions.map((q) => ({ prompt: q.prompt, answer: q.key, type: 'auto', spelling: !!q.spellingCounts })));
  };

  const save = async () => {
    setError(null);
    const isNew = classId === 'new';
    if (isNew && !className.trim()) return setError('Give the class a name.');
    if (isNew && roster.length === 0) return setError('Paste your class list, one pupil per line.');
    if (!title.trim()) return setError('Give the quiz a title.');
    if (keys.length === 0) return setError('Add at least one question.');
    if (keys.some((k) => keyProblem(k))) return setError('Fix the answers marked in red first.');
    if (!fit.fits) return setError("These answers don't fit on one answer sheet. Split the quiz into two, or turn a paragraph into a short answer.");
    let cls: ClassRec | undefined = classes?.find((c) => c.id === classId);
    if (isNew) {
      cls = { id: uid('c'), name: className.trim(), roster: roster.map((name) => ({ id: uid('s'), name })), createdAt: Date.now() };
      await store.putClass(cls);
    }
    const quiz: QuizRec = { id: uid('q'), classId: cls!.id, title: title.trim(), keys, unsimplifiedCredit: credit, createdAt: Date.now(), ...(subject !== 'auto' ? { subject } : {}), gradeBand: grade, ...(extract.trim() ? { extract: extract.trim() } : {}) };
    await store.putQuiz(quiz);
    go(href.scan(quiz.id));
  };

  const fit = useMemo(() => sheetFit(keys), [JSON.stringify(keys)]); // eslint-disable-line react-hooks/exhaustive-deps
  const openCount = keys.filter((k) => QTYPES[typeOf(k)].markedBy === 'suggested').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New quiz</h1>
          <p className="muted" style={{ margin: 0 }}>Type the answer key once. Tickmark works out each question's type from the key; change it if it guessed wrong. Everything stays in this browser.</p>
        </div>
      </div>

      <div className="split">
        <section className="panel" aria-labelledby="key-h">
          <div className="panel-head">
            <h2 id="key-h">Answer key</h2>
            <div className="templates" role="group" aria-label="Start from a sample key">
              <span className="small muted">Start from</span>
              {SAMPLES.map((k) => <button key={k} className="btn small quiet" onClick={() => applyTemplate(k)}>{sampleManifest(k)?.quiz.className ?? k}</button>)}
            </div>
          </div>
          <div className="row" style={{ alignItems: 'flex-end', marginBottom: 14 }}>
            <label className="field grow">Quiz title
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Plants and water" spellCheck={false} autoComplete="off" />
            </label>
            <label className="field">Subject
              <select value={subject} onChange={(e) => { const v = e.target.value as Subject | 'auto'; setSubject(v); if (v === 'english') setRows(rows.map((r) => ({ ...r, spelling: true }))); }}><option value="auto">Detect from the key</option>{SUBJECTS.map((s) => <option key={s} value={s}>{SUBJECT_NAME[s]}</option>)}</select>
            </label>
          </div>
          <table className="keytable">
            <thead><tr><th>Q</th><th>Question as printed</th><th>Answer key</th><th className="typecell">Type</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const prob = problemOf(i);
                const has = !!(r.prompt.trim() || r.answer.trim());
                const detected = r.answer.trim() ? detectType(r.answer, r.prompt) : 'word'; // an empty key isn't a short answer yet
                const t = r.type === 'auto' ? detected : r.type;
                const k: QuestionKey = { q: i + 1, prompt: r.prompt, answer: r.answer, type: t };
                return (
                  <tr key={i}>
                    <td className="n">{i + 1}</td>
                    <td><span className="m-label">Question {i + 1} as printed</span><textarea rows={r.prompt.length > 34 ? 2 : 1} style={{ minHeight: 40 }} aria-label={`Question ${i + 1} as printed`} value={r.prompt} placeholder={i === 0 ? 'e.g. 2/3 + 1/6' : i === 1 ? 'e.g. Why do plants need light?' : 'e.g. Which gas do plants take in? A) oxygen B) carbon dioxide'} onChange={(e) => set(i, { prompt: e.target.value })} spellCheck={false} /></td>
                    <td><span className="m-label">Answer key</span>
                      {/* one element whatever the detected type, so focus never drops while typing (round 6, R6-4-01) */}
                      <textarea aria-label={`Answer key ${i + 1}`} rows={t === 'short' || t === 'passage' ? 3 : 1} style={{ minHeight: t === 'short' || t === 'passage' ? 84 : 40 }} value={r.answer}
                        placeholder={t === 'passage' ? 'e.g. Rubric: Ideas 3; Organisation 2' : t === 'short' ? 'e.g. light gives energy; to make food' : i === 0 ? 'e.g. 5/6' : i === 1 ? 'e.g. light gives energy; to make food' : 'e.g. B'}
                        onChange={(e) => set(i, { answer: e.target.value })} className={prob ? 'bad' : ''} spellCheck={false} />
                      {has && prob && <div className="problem" role="alert">{prob}</div>}
                      {has && !prob && t === 'short' && <div className="tiny muted" style={{ marginTop: 4 }}>{keyPoints(r.answer).length} key point{keyPoints(r.answer).length === 1 ? '' : 's'}, {outOfFor(k)} mark{outOfFor(k) === 1 ? '' : 's'}</div>}
                      {has && !prob && t === 'passage' && <div className="tiny muted" style={{ marginTop: 4 }}>{(parseRubric(r.answer) ?? []).map((l) => `${l.line} ${l.max}`).join(' · ')}</div>}
                    </td>
                    <td className="typecell">
                      <select aria-label={`Question ${i + 1} type`} value={r.type} onChange={(e) => set(i, { type: e.target.value as Row['type'] })}>
                        <option value="auto">{has ? `${QTYPES[detected].label} (detected)` : 'Detect from the key'}</option>
                        {(Object.keys(QTYPES) as QType[]).map((q) => <option key={q} value={q}>{QTYPES[q].label}</option>)}
                      </select>
                      {has && (
                        <div className="detected">
                          <span className={`chip ${QTYPES[t].markedBy === 'code' ? 'code' : 'pencil'}`}>{QTYPES[t].markedBy === 'code' ? 'Marked by code' : 'Nano suggests, you decide'}</span>
                          {t === 'word' && <label className="check-line tiny" title="Gemini Nano tends to read a misspelt word as the right word, so when spelling counts you check each answer that reads as the key against the pupil's handwriting."><input type="checkbox" checked={r.spelling} onChange={(e) => set(i, { spelling: e.target.checked })} />Spelling or exact form counts</label>}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row mt">
            <button className="btn small" onClick={() => setRows([...rows, { ...EMPTY, spelling: subject === 'english' }])}>Add question</button>
            {rows.length > 1 && <button className="btn small quiet" onClick={() => setRows(rows.slice(0, -1))}>Remove last</button>}
            {keys.length > 0 && (
              <span className={`small ${fit.fits ? 'muted' : 'bad'}`} role="status" data-fit={fit.fits ? 'ok' : 'over'}>
                {fit.fits ? `The answer sheet is ${Math.round(fit.used * 100)}% full.` : "Too many answers for one answer sheet: split the quiz, or turn a paragraph into a short answer."}
              </span>
            )}
          </div>
          {(subject === 'english' || extract) && (
            <label className="field mt">Reading extract printed on the sheet (optional)
              <span className="hint">Kept with the quiz so you can see it while checking. It is never sent anywhere.</span>
              <textarea value={extract} onChange={(e) => setExtract(e.target.value)} />
            </label>
          )}
        </section>

        <aside className="stack">
          <section className="panel stack" aria-labelledby="class-h">
            <h2 id="class-h" style={{ margin: 0 }}>Class</h2>
            {classes && classes.length > 0 && (
              <label className="field">Add the quiz to
                <select value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="new">A new class</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            {classId === 'new' && (
              <>
                <label className="field">Class name
                  <input data-student value={className} onChange={(e) => setClassName(e.target.value)} placeholder="e.g. 7A science" spellCheck={false} autoComplete="off" />
                </label>
                <label className="field">Class list
                  <span className="hint">One pupil per line, as they write their names. Copy a column from your register.</span>
                  <textarea data-student value={rosterText} onChange={(e) => setRosterText(e.target.value)} spellCheck={false} autoComplete="off" placeholder={'e.g.\nAanya Kapoor\nBen Okafor\nमीरा शर्मा'} />
                  <span className="hint">{roster.length} pupil{roster.length === 1 ? '' : 's'}{roster.length > 0 && roster.length < 5 ? '. Planning a lesson needs at least 5 marked sheets.' : ''}{skipped.length ? ` Left out, longer than 60 characters: ${skipped.map((x) => `"${x.slice(0, 24)}…"`).join(', ')}.` : ''}</span>
                </label>
              </>
            )}
            <label className="field">Age group
              <select value={grade} onChange={(e) => setGrade(e.target.value as GradeBand)}>{GRADE_BANDS.map((g) => <option key={g} value={g}>{GRADE_NAME[g]}</option>)}</select>
            </label>
          </section>
          <section className="panel stack" aria-labelledby="credit-h">
            <h2 id="credit-h" style={{ margin: 0, fontSize: '1.0625rem' }}>Half-right answers</h2>
            <p className="small muted" style={{ margin: 0 }}>Right but not simplified (6/8 for 3/4), a missing unit, or 0.45 for 45%.</p>
            <div className="seg" role="group" aria-label="Half-right answers earn">
              {[[1, 'Full mark'], [0.5, 'Half'], [0, 'None']].map(([v, l]) => <button key={v} aria-pressed={credit === v} onClick={() => setCredit(v as number)}>{l}</button>)}
            </div>
          </section>
          {keys.length > 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              {keys.length - openCount} question{keys.length - openCount === 1 ? '' : 's'} marked by code{openCount ? `; ${openCount} suggested by Gemini Nano for you to decide` : ''}.
            </p>
          )}
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="row">
            <button className="btn primary" onClick={save}>Save and add sheets</button>
            <a className="btn quiet" href={href.home()}>Cancel</a>
          </div>
        </aside>
      </div>
    </>
  );
}
