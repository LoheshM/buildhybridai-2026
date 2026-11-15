import { useState } from 'react';
import { href } from '../app/router';
import { runState, stopRun } from '../app/runner';
import { ensureSampleClass, sampleKeyOfClass } from '../app/boot';
import { needsCheck } from '../marking/pipeline';
import { store } from '../store/db';
import { useLoad } from './hooks';


export function Home() {
  const [data, reload] = useLoad(async () => {
    const classes = await store.classes();
    return Promise.all(classes.map(async (c) => {
      const quizzes = (await store.quizzes(c.id)).sort((a, b) => a.createdAt - b.createdAt);
      const qs = await Promise.all(quizzes.map(async (q) => {
        const sheets = await store.sheets(q.id);
        return { q, total: sheets.length, read: sheets.filter((s) => s.status === 'read' || s.status === 'checked').length, toCheck: sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0) };
      }));
      return { c, qs, subject: quizzes[0]?.subject ?? 'other' };
    }));
  }, []);
  const mine = data?.filter((x) => !x.c.sample) ?? [];
  const samples = data?.filter((x) => x.c.sample) ?? [];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Classes</h1>
          <p className="muted" style={{ margin: 0 }}>Everything here is stored in this browser only.</p>
        </div>
        <a className="btn primary" href={href.new()}>New quiz</a>
      </div>
      {!data ? <p className="muted">Loading classes…</p> : (
        <>
          {mine.length === 0 && (
            <div className="panel" style={{ marginBottom: 28 }}>
              <h2>Your classes go here</h2>
              <p className="muted">Paste a class list and type the answer key; Tickmark works out each question's type from the key. Then add one photo per pupil, or type the answers in if this browser has no on-device AI.</p>
              <a className="btn primary" href={href.new()}>Set up a class and quiz</a>
            </div>
          )}
          {mine.length > 0 && <ClassList items={mine} reload={reload} />}
          <h2 className="mt-l">Sample classes</h2>
          <p className="muted">Made-up pupils for trying Tickmark. Reset one to read it again from the start.</p>
          <ClassList items={samples} reload={reload} />
        </>
      )}
    </>
  );
}

type Item = { c: Awaited<ReturnType<typeof store.classes>>[number]; qs: { q: { id: string; title: string; keys: unknown[] }; total: number; read: number; toCheck: number }[]; subject: string };

function ClassList({ items, reload }: { items: Item[]; reload: () => void }) {
  return (
    <div className="classlist">
      {items.map(({ c, qs, subject }) => (
        <section key={c.id} className="classrow" aria-labelledby={`c-${c.id}`} data-subject={subject}>
          <div className="spine" />
          <div className="body">
            <div className="row spread">
              <div className="grow">
                <h3 id={`c-${c.id}`} style={{ margin: 0 }} className="clip" title={c.name}>{c.name}</h3>
                <span className="small muted">{c.roster.length} pupils{c.sample ? ' · made up' : ''}</span>
              </div>
              {c.sample ? <ResetSample classId={c.id} onDone={reload} /> : (
                <button className="btn small danger" onClick={async () => { if (confirmDelete(c.name)) { await stopRun(); await store.deleteClass(c.id); reload(); } }}>Delete class</button>
              )}
            </div>
            {qs.map(({ q, total, read, toCheck }) => (
              <div key={q.id} className="quizline">
                <div className="grow">
                  <a href={href.scan(q.id)} style={{ fontWeight: 700 }}>{q.title}</a>
                  <div className="small muted">
                    {q.keys.length} questions · {read} of {total} sheets read
                    {toCheck > 0 && <> · <span className="flag soft">{toCheck} waiting for you</span></>}
                  </div>
                </div>
                <div className="row">
                  {toCheck > 0 && <a className="btn small" href={href.check(q.id)}>Check</a>}
                  <a className="btn small" href={href.results(q.id)}>Results</a>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// A plain prompt is acceptable here: it is the teacher's own data and the wording names the class.
function confirmDelete(name: string) {
  return window.confirm(`Delete "${name}" with its quizzes, photos and marks from this browser? This can't be undone.`);
}

function ResetSample({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const k = sampleKeyOfClass(classId);
  return (
    <button className="btn small" disabled={busy || runState().running || !k} aria-busy={busy}
      title={runState().running ? 'Wait for the current reading to finish' : 'Start this sample class again from unread sheets'}
      onClick={async () => { if (!window.confirm('Start this sample class again? Its readings and every mark you decided are cleared.')) return; setBusy(true); try { await ensureSampleClass(k!, true); } finally { setBusy(false); onDone(); } }}>
      {busy ? 'Resetting…' : 'Reset'}
    </button>
  );
}
