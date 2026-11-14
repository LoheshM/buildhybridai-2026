import { href } from '../app/router';
import { ensureSampleClass } from '../app/boot';
import { needsCheck } from '../marking/pipeline';
import { store } from '../store/db';
import { useLoad } from './hooks';

export function Home() {
  const [data, reload] = useLoad(async () => {
    const classes = await store.classes();
    return Promise.all(classes.map(async (c) => {
      const quizzes = await store.quizzes(c.id);
      const qs = await Promise.all(quizzes.map(async (q) => {
        const sheets = await store.sheets(q.id);
        return { q, total: sheets.length, read: sheets.filter((s) => s.status === 'read' || s.status === 'checked').length, flags: sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0) };
      }));
      return { c, qs };
    }));
  }, []);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Classes</h1>
        <a className="btn primary" href={href.new()}>New class and quiz</a>
      </div>
      {!data ? <p className="muted">Loading…</p> : (
        <div className="stack" style={{ gap: 20 }}>
          {data.map(({ c, qs }) => (
            <section key={c.id} className="sheet">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ marginBottom: 2 }}>{c.name}</h2>
                  <span className="muted small">{c.roster.length} students{c.sample ? '. Made-up students and handwriting for trying Tickmark.' : ''}</span>
                </div>
                <div className="row">
                  {c.sample && <button className="btn small" onClick={async () => { await ensureSampleClass(true); reload(); }}>Reset sample</button>}
                  {!c.sample && <button className="btn small danger" onClick={async () => { if (confirmDelete(c.name)) { await store.deleteClass(c.id); reload(); } }}>Delete class</button>}
                </div>
              </div>
              <table className="plain" style={{ marginTop: 12 }}>
                <thead><tr><th>Quiz</th><th>Sheets</th><th>Read</th><th>Waiting for you</th><th /></tr></thead>
                <tbody>
                  {qs.map(({ q, total, read, flags }) => (
                    <tr key={q.id}>
                      <td><a href={href.scan(q.id)}>{q.title}</a></td>
                      <td>{total}</td>
                      <td>{read}</td>
                      <td>{flags ? <span className="flag">{flags} to check</span> : <span className="muted">none</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <a className="btn small" href={href.check(q.id)}>Check</a>{' '}
                        <a className="btn small" href={href.results(q.id)}>Results</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

// A plain prompt is acceptable here: it is the teacher's own data and the wording names the class.
function confirmDelete(name: string) {
  return window.confirm(`Delete "${name}" with its quizzes, photos and marks from this laptop? This can't be undone.`);
}
