import { useEffect, useState } from 'react';
import { DEVICE_STATE_TEXT } from '../ai/gate';
import { go, href } from '../app/router';
import { SAMPLES, sampleManifest, sampleQuizId, type SampleKey } from '../app/boot';
import { keysFromManifest } from '../app/boot';
import { typeOf } from '../marking/mark';
import { QTYPES, type QType } from '../marking/qtypes';
import type { Status } from '../marking/mark';
import { downloadDeviceModel, useDevice } from './hooks';
import { Notice } from './App';
import { Icon, Mk } from './Marks';

// An excerpt of Science 7A as Tickmark marks it: code in ink, Gemini Nano's suggestions in pencil.
type Cell = { s: Status | 'suggest-full' | 'suggest-part' | 'suggest-none'; pencil?: boolean; becomes?: Status };
const DEMO_Q = ['Q1', 'Q3', 'Q5', 'Q6', 'Q7'];
const DEMO_QT = ['choice', 'word', 'number', 'short', 'short'];
const DEMO: { name: string; cells: Cell[]; total: string }[] = [
  { name: 'Aanya Kapoor', cells: [{ s: 'correct' }, { s: 'correct' }, { s: 'wrong' }, { s: 'suggest-part', pencil: true, becomes: 'partial' }, { s: 'suggest-part', pencil: true, becomes: 'partial' }], total: '4' },
  { name: 'Ben Okafor', cells: [{ s: 'correct' }, { s: 'correct' }, { s: 'correct' }, { s: 'suggest-full', pencil: true, becomes: 'correct' }, { s: 'suggest-full', pencil: true, becomes: 'correct' }], total: '7' },
  { name: 'Chloe Martin', cells: [{ s: 'wrong' }, { s: 'correct' }, { s: 'partial' }, { s: 'suggest-none', pencil: true, becomes: 'wrong' }, { s: 'suggest-part', pencil: true, becomes: 'partial' }], total: '2½' },
  { name: 'Dev Malhotra', cells: [{ s: 'correct' }, { s: 'wrong' }, { s: 'correct' }, { s: 'suggest-part', pencil: true }, { s: 'suggest-full', pencil: true }], total: '?' },
];

export function Welcome() {
  const d = useDevice();
  const st = d.state === 'checking' ? null : DEVICE_STATE_TEXT[d.state];
  return (
    <>
      <section className="hero" aria-labelledby="hero-h">
        <div>
          <h1 id="hero-h">Mark the whole pile on this laptop.</h1>
          <p className="lede">
            Type the answer key once. Tickmark reads every pupil's worksheet with Gemini Nano, here in Chrome, and works out what kind of question each one is.
            Then it marks, shows you what the class got wrong, and plans tomorrow's lesson from totals with no names in them.
          </p>
          <ul className="rule-line" aria-label="Who marks what">
            <li><span className="chip code">Ink</span>Code marks what it can check exactly</li>
            <li><span className="chip pencil">Pencil</span>Gemini Nano suggests the rest</li>
            <li><Icon name="pen" size={18} />You decide every pencil mark</li>
          </ul>
          <div className="row">
            <a className="btn primary" href={href.scan(sampleQuizId('science'))}>Try a sample class</a>
            <a className="btn" href={href.new()}>Mark my own class</a>
          </div>
        </div>
        <DemoRegister />
      </section>

      {st && d.state !== 'available' && (
        <div className="mt-l">
          <Notice tone={d.state === 'unsupported' || d.state === 'unavailable' ? undefined : 'warn'}>
            <p><strong>{st.title}.</strong> {st.body}</p>
            {d.state === 'downloadable' && <div className="row"><button className="btn primary small" onClick={() => downloadDeviceModel()}>Download Gemini Nano</button></div>}
            {d.state === 'downloading' && d.progress !== null && <div className="progress mt" role="progressbar" aria-label="Download progress" aria-valuenow={Math.round(d.progress * 100)}><i style={{ width: `${Math.round(d.progress * 100)}%` }} /></div>}
            {d.error && <p className="small mt">{d.error}</p>}
          </Notice>
        </div>
      )}

      <section aria-labelledby="doors-h" className="mt-l">
        <h2 id="doors-h" className="sr-only">Classes to try</h2>
        <div className="doors">
          {SAMPLES.map((k) => <ClassDoor key={k} k={k} />)}
        </div>
        <p className="small muted mt">The three classes are made up: invented pupils, handwriting drawn from open-licence handwriting fonts, mistakes planted on purpose. With Gemini Nano they are read live on this laptop; without it, cloud Gemini readings recorded on 16 Nov stand in.</p>
      </section>

      <section className="where" aria-label="Where the work happens">
        <div>
          <h3><Icon name="laptop" size={18} />On this laptop</h3>
          <p>Gemini Nano reads every photo and suggests marks for sentences and paragraphs. Code marks the rest and names each mistake. Photos, names and answers stay here.</p>
        </div>
        <div>
          <h3><Icon name="pen" size={18} />You</h3>
          <p>Turn pencil into ink one key at a time, by question, the way you'd mark a pile: every answer to Q6, then every answer to Q7.</p>
        </div>
        <div>
          <h3><Icon name="cloud" size={18} />In the cloud</h3>
          <p>Only class totals, like "Q6: 9 missed where the energy comes from", go to Gemini, which writes a reteach lesson and parent notes in Hindi or Tamil. Names are filled in back here.</p>
        </div>
      </section>
    </>
  );
}

function ClassDoor({ k }: { k: SampleKey }) {
  const m = sampleManifest(k);
  if (!m) return null;
  const keys = keysFromManifest(m);
  const types = [...new Set(keys.map((q) => typeOf(q)))] as QType[];
  const open = types.some((t) => QTYPES[t].markedBy === 'suggested');
  return (
    <button className={`door ${k}`} onClick={() => go(href.scan(sampleQuizId(k)))} aria-label={`Open ${m.quiz.className}, ${m.quiz.title}: ${m.students.length} worksheets`}>
      <div>
        <h3>{m.quiz.className}</h3>
        <div className="sub">{m.quiz.title} · {m.students.length} worksheets · {keys.length} questions</div>
      </div>
      <div className="types">{types.map((t) => <span key={t} className={`chip ${QTYPES[t].markedBy === 'code' ? 'code' : 'pencil'}`}>{QTYPES[t].label}</span>)}</div>
      <div className="small muted">{open ? 'Some answers are suggested in pencil for you to decide.' : 'Every answer is marked by code.'}</div>
    </button>
  );
}

/** The one authored moment: pencil suggestions turn to ink, one at a time, as if the teacher pressed Enter. */
function DemoRegister() {
  const [inked, setInked] = useState(0);
  const order = DEMO.flatMap((r, ri) => r.cells.map((c, ci) => (c.becomes ? `${ri}-${ci}` : null))).filter(Boolean) as string[];
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setInked(order.length); return; }
    let n = 0;
    const t0 = setTimeout(function tick() { n++; setInked(n); if (n < order.length) setTimeout(tick, 420); }, 1100);
    return () => clearTimeout(t0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const done = new Set(order.slice(0, inked));
  return (
    <figure className="demo" aria-label="Example: part of Science 7A's register while it is being marked" style={{ margin: 0 }}>
      <div className="demo-head"><b>Science 7A · Plants and water</b><span className="pill device"><i />On this laptop</span></div>
      <div className="register-wrap">
        <table className="register">
          <thead><tr><th className="who" scope="col">Pupil</th>{DEMO_Q.map((q, i) => <th key={q} scope="col">{q}<span className="qt">{QTYPES[DEMO_QT[i] as QType].label.split(' ')[0]}</span></th>)}<th scope="col">Out of 7</th></tr></thead>
          <tbody>
            {DEMO.map((r, ri) => (
              <tr key={r.name}>
                <th className="who" scope="row">{r.name}</th>
                {r.cells.map((c, ci) => {
                  const id = `${ri}-${ci}`;
                  const isInk = !c.pencil || done.has(id);
                  const s = isInk && c.becomes ? c.becomes : c.s;
                  return <td key={ci} className={`cell ${!isInk ? 'pending' : s === 'wrong' ? 'wrong' : s === 'partial' ? 'partial' : ''}`}><Mk status={s} hand={isInk ? 'ink' : 'pencil'} draw={isInk && !!c.pencil} /></td>;
                })}
                <td className="total"><span className="hand" style={{ color: r.total === '?' ? 'var(--pencil)' : 'var(--red)', fontSize: '1.1rem' }}>{r.total}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <figcaption className="demo-foot"><span><span className="chip code">Ink</span> decided</span><span><span className="chip pencil">Pencil</span> suggested by Gemini Nano, waiting for you</span></figcaption>
    </figure>
  );
}
