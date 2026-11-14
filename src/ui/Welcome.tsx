import { DEVICE_STATE_TEXT } from '../ai/gate';
import { go, href } from '../app/router';
import { SAMPLE_QUIZ_ID } from '../app/boot';
import { downloadDeviceModel, useDevice } from './hooks';
import { ScoreRing } from './Marks';

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
          {st && (
            <div className={`callout ${d.state === 'available' ? 'device' : d.state === 'unavailable' || d.state === 'unsupported' ? 'bad' : ''}`} style={{ marginTop: 20 }} role="status">
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
          <div className="mark-sheet" style={{ transform: 'rotate(-3deg)', position: 'absolute', inset: '18px -14px auto 14px', opacity: .55 }}>
            <img src="/samples/s12.jpg" alt="" />
          </div>
          <div className="mark-sheet" style={{ transform: 'rotate(1.5deg)' }}>
            <img src="/samples/s05.jpg" alt="" />
            <ScoreRing points={10} outOf={10} big />
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
