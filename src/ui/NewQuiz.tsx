import { useMemo, useState } from 'react';
import { go, href } from '../app/router';
import { sampleManifest } from '../app/boot';
import { keyProblem, type QuestionKey } from '../marking/mark';
import { parseRoster } from '../marking/roster';
import { store, uid, type ClassRec, type QuizRec } from '../store/db';
import { useLoad } from './hooks';

interface Row { prompt: string; answer: string }

export function NewQuiz() {
  const [classes] = useLoad(async () => (await store.classes()).filter((c) => !c.sample), []);
  const [classId, setClassId] = useState<string>('new');
  const [className, setClassName] = useState('');
  const [rosterText, setRosterText] = useState('');
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>([{ prompt: '', answer: '' }, { prompt: '', answer: '' }, { prompt: '', answer: '' }]);
  const [credit, setCredit] = useState(0.5);
  const [error, setError] = useState<string | null>(null);

  const roster = useMemo(() => parseRoster(rosterText), [rosterText]);
  const filled = rows.filter((r) => r.prompt.trim() || r.answer.trim());
  const keys: QuestionKey[] = filled.map((r, i) => ({ q: i + 1, prompt: r.prompt.trim(), answer: r.answer.trim() }));
  const problems = keys.map((k) => (k.prompt ? keyProblem(k) : k.answer ? null : 'Add an answer.'));

  const useTemplate = () => {
    const m = sampleManifest();
    if (!m) return;
    setTitle('Fractions check');
    setRows(m.quiz.questions.map((q) => ({ prompt: q.prompt, answer: q.key })));
  };

  const save = async () => {
    setError(null);
    const isNew = classId === 'new';
    if (isNew && !className.trim()) return setError('Give the class a name.');
    if (isNew && roster.length === 0) return setError('Paste your class list, one student per line.');
    if (!title.trim()) return setError('Give the quiz a title.');
    if (keys.length === 0) return setError('Add at least one question.');
    if (problems.some(Boolean)) return setError('Fix the answers marked in red first.');
    let cls: ClassRec | undefined = classes?.find((c) => c.id === classId);
    if (isNew) {
      cls = { id: uid('c'), name: className.trim(), roster: roster.map((name) => ({ id: uid('s'), name })), createdAt: Date.now() };
      await store.putClass(cls);
    }
    const quiz: QuizRec = { id: uid('q'), classId: cls!.id, title: title.trim(), keys, unsimplifiedCredit: credit, createdAt: Date.now() };
    await store.putQuiz(quiz);
    go(href.scan(quiz.id));
  };

  return (
    <>
      <h1>New class and quiz</h1>
      <p className="muted">Everything you type here is saved in this browser only.</p>
      <div className="grid2" style={{ marginTop: 16 }}>
        <section className="sheet stack">
          <h2>Class</h2>
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
                <input data-student value={className} onChange={(e) => setClassName(e.target.value)} placeholder="6B maths" spellCheck={false} autoComplete="off" />
              </label>
              <label className="field">Class list
                <span className="hint">One student per line, as written on their sheets. Copy a column from your register.</span>
                <textarea data-student value={rosterText} onChange={(e) => setRosterText(e.target.value)} spellCheck={false} autoComplete="off" placeholder={'Aarav Shah\nMeera Krishnan\nRohan Das'} />
                <span className="hint">{roster.length} student{roster.length === 1 ? '' : 's'}{roster.length > 0 && roster.length < 5 ? '. Lesson planning needs at least 5 marked sheets.' : ''}</span>
              </label>
            </>
          )}
        </section>

        <section className="sheet stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 style={{ margin: 0 }}>Answer key</h2>
            <button className="btn small" onClick={useTemplate}>Use the fractions template</button>
          </div>
          <label className="field">Quiz title
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Fractions check" spellCheck={false} autoComplete="off" />
          </label>
          <table className="plain">
            <thead><tr><th>#</th><th>Question as printed</th><th>Answer</th><th /></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const idx = filled.indexOf(r);
                const prob = idx >= 0 ? problems[idx] : null;
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td><input aria-label={`Question ${i + 1}`} value={r.prompt} placeholder="2/3 + 1/6" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, prompt: e.target.value } : x)))} style={{ width: '100%' }} spellCheck={false} /></td>
                    <td>
                      <input aria-label={`Answer ${i + 1}`} value={r.answer} placeholder="5/6" onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)))} style={{ width: '7em', borderColor: prob ? 'var(--red)' : undefined }} spellCheck={false} />
                      {prob && <div className="small" style={{ color: 'var(--red)' }}>{prob}</div>}
                    </td>
                    <td><button className="btn ghost small" aria-label={`Remove question ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))}>Remove</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row">
            <button className="btn small" onClick={() => setRows([...rows, { prompt: '', answer: '' }])}>Add question</button>
            <span className="muted small">Fractions, mixed numbers like 1 1/2, and decimals are marked by value. Word answers are matched exactly.</span>
          </div>
          <label className="field">Answers that are right but not simplified (6/8 for 3/4) earn
            <select value={credit} onChange={(e) => setCredit(Number(e.target.value))}>
              <option value={1}>Full marks</option>
              <option value={0.5}>Half a mark</option>
              <option value={0}>No marks</option>
            </select>
          </label>
        </section>
      </div>
      {error && <p className="callout bad" role="alert" style={{ marginTop: 16 }}>{error}</p>}
      <div className="row" style={{ marginTop: 20 }}>
        <button className="btn primary" onClick={save}>Save and add photos</button>
        <a className="btn ghost" href={href.home()}>Cancel</a>
      </div>
    </>
  );
}
