import { DEVICE_STATE_TEXT } from '../ai/gate';
import { go, href } from '../app/router';
import { SAMPLE_QUIZ_ID } from '../app/boot';
import { downloadDeviceModel, useDevice } from './hooks';
import { PenPass, ScoreRing, type PenMark } from './Marks';

// Marks for sample sheet s16 (Anika: added tops and bottoms on Q1, Q2, Q4 and Q5): the hero shows the product working.
const HERO_MARKS: PenMark[] = ['wrong', 'wrong', 'correct', 'wrong', 'wrong', 'correct', 'correct', 'correct', 'correct', 'correct'].map((s) => ({ status: s as PenMark['status'] }));

export function Welcome() {
  const d = useDevice();
  const st = d.state === 'checking' ? null : DEVICE_STATE_TEXT[d.state];
  return (
    <>
      <section className="hero">
        <div>
          <h1>Mark a class set of worksheets without uploading a single photo.</h1>
          <p className="lede">
            Tickmark reads each paper maths worksheet with Gemini Nano, on this laptop. Code marks every answer against your key,
            and you check only the answers it flags. To plan tomorrow's lesson, just the class totals go to the cloud.
          </p>
          <div className="doors">
            <button className="door primary" onClick={() => go(href.scan(SAMPLE_QUIZ_ID))}>
              <strong>Try the sample class</strong>
              <span className="muted">28 made-up worksheets from a fractions check. Nothing to set up.</span>
            </button>
            <button className="door" onClick={() => go(href.new())}>
              <strong>Mark my own class</strong>
              <span className="muted">Paste your class list, type the answer key, add photos.</span>
            </button>
          </div>
          {st && d.state !== 'available' && (
            <div className="callout" style={{ marginTop: 20 }} role="status">
              <strong>{st.title}.</strong> {st.body}
              {d.state === 'downloadable' && (
                <div style={{ marginTop: 10 }}><button className="btn primary small" onClick={() => downloadDeviceModel()}>Download Gemini Nano</button></div>
              )}
              {d.state === 'downloading' && d.progress !== null && (
                <div style={{ marginTop: 10 }} className="progress" aria-label="Download progress"><i style={{ width: `${Math.round(d.progress * 100)}%` }} /></div>
              )}
              {d.error && <div className="small" style={{ marginTop: 6 }}>{d.error}</div>}
            </div>
          )}
        </div>
        <div aria-hidden="true" style={{ position: 'relative', maxWidth: 380, justifySelf: 'center', width: '100%' }}>
          <div className="mark-sheet" style={{ transform: 'rotate(1.5deg)' }}>
            <img src="/samples/s16.jpg" alt="" />
            <PenPass play delayMs={500} marks={HERO_MARKS} note={{ row: 0, text: 'added tops & bottoms' }} />
            <ScoreRing points={6} outOf={10} big />
          </div>
        </div>
      </section>

      <section className="flowline" aria-label="How Tickmark works">
        <div className="dev">
          <h3>On this laptop</h3>
          <p className="muted">Gemini Nano reads every photo. Code marks it and names the mistake, such as adding tops and bottoms. Photos, names and answers stay here.</p>
        </div>
        <div>
          <h3>You</h3>
          <p className="muted">Check the answers Tickmark flags: crossed-out work, an unusual answer, a mixed number it isn't sure of. One key press each.</p>
        </div>
        <div className="cld">
          <h3>In the cloud</h3>
          <p className="muted">Only class totals, like "Q2: 9 added straight across", go to Gemini, which writes a reteach lesson and parent notes in Hindi or Tamil. Names are filled in here.</p>
        </div>
      </section>
    </>
  );
}
