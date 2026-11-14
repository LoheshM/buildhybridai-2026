import { useState } from 'react';
import { currentSettings } from '../ai/firebase';
import { counters, ledger, type CallEvent, type NetEvent } from '../ai/ledger';
import { BUILD } from '../config';
import { storageEstimate, store } from '../store/db';
import { useLedger, useLoad } from './hooks';

const WHERE_TEXT: Record<CallEvent['where'], string> = { on_device: 'On this laptop', in_cloud: 'Cloud AI', recorded: 'Recorded reading', local: 'Not completed', blocked: 'Blocked' };
const DATA_TEXT: Record<CallEvent['dataClass'], string> = { student: 'Student sheet', sample: 'Sample sheet (made up)', totals: 'Class totals', system: 'Set-up' };
const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function Privacy() {
  const events = useLedger();
  const c = counters(events);
  const net = events.filter((e): e is NetEvent => e.kind === 'net').reverse();
  const calls = events.filter((e): e is CallEvent => e.kind === 'call').reverse();
  const [est, reload] = useLoad(storageEstimate, []);
  const [open, setOpen] = useState<string | null>(null);
  const s = currentSettings();
  const studentCalls = calls.filter((e) => e.dataClass === 'student');
  const studentOnDevice = studentCalls.filter((e) => e.where === 'on_device').length;

  return (
    <>
      <h1>Privacy &amp; data</h1>
      <p className="muted" style={{ maxWidth: '72ch' }}>Student photos, names and answers stay on this laptop. The only thing a real class ever sends to the AI service is the class-totals table you see before you send it. This page lists every request this browser sent to the AI service, captured just before it left.</p>

      <div className="stats">
        <div className="stat"><b>{c.cloudRequests}</b><span>requests sent to cloud AI</span></div>
        <div className="stat"><b style={{ color: c.studentPhotosSent ? 'var(--red)' : 'var(--green)' }}>{c.studentPhotosSent}</b><span>student photos sent{c.studentPhotosBlocked ? ` (${c.studentPhotosBlocked} blocked)` : ''}</span></div>
        <div className="stat"><b>{studentOnDevice}/{studentCalls.length}</b><span>student-sheet reads on this laptop</span></div>
        <div className="stat"><b style={{ color: c.blocked ? 'var(--red)' : undefined }}>{c.blocked}</b><span>requests blocked by Tickmark</span></div>
      </div>

      <section className="sheet section">
        <h2>Outbox</h2>
        <p className="muted small">What was sent to Firebase AI Logic, captured in the browser just before sending. Images are shown by their fingerprint; only made-up sample sheets may ever be among them.</p>
        {net.length === 0 ? <p className="muted">Nothing has been sent to the AI service yet.</p> : net.slice(0, 100).map((e) => {
          const body = (() => { try { return JSON.stringify(JSON.parse(e.body), null, 1); } catch { return e.body.slice(0, 4000); } })();
          return (
            <div key={e.id}>
              <div className="outbox-row">
                <span className="small muted">{time(e.at)}</span>
                <span>{e.blocked ? <b style={{ color: 'var(--red)' }}>Blocked: {e.reason}</b> : e.images ? `Made-up sample sheet + reading instructions` : e.path.includes('generateContent') ? 'Class totals + lesson instructions' : 'Request to the AI service'}</span>
                <span className="small muted">{(e.bytes / 1024).toFixed(1)} KB</span>
                <button className="btn small" onClick={() => setOpen(open === e.id ? null : e.id)}>{open === e.id ? 'Hide' : 'Show'} request</button>
              </div>
              {open === e.id && <pre className="json">{body}</pre>}
            </div>
          );
        })}
      </section>

      <section className="sheet section">
        <h2>Every AI call</h2>
        <div style={{ overflowX: 'auto', maxHeight: 420 }}>
          <table className="plain">
            <thead><tr><th>Time</th><th>What</th><th>Data</th><th>Asked for</th><th>Ran</th><th>Seconds</th></tr></thead>
            <tbody>
              {calls.slice(0, 200).map((e) => (
                <tr key={e.id}>
                  <td className="small">{time(e.at)}</td><td>{e.task}</td><td>{DATA_TEXT[e.dataClass]}</td>
                  <td className="small"><code>{e.mode}</code></td>
                  <td><span className={`pill ${e.where === 'on_device' ? 'device' : e.where === 'blocked' || !e.ok ? 'bad' : 'cloud'}`}>{WHERE_TEXT[e.where]}</span>{e.note && <div className="small muted">{e.note}</div>}</td>
                  <td>{(e.ms / 1000).toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid2 section">
        <section className="sheet">
          <h2>Check it yourself</h2>
          <ol>
            <li>Open Chrome DevTools (<kbd>F12</kbd>) and choose <b>Network</b>.</li>
            <li>Type <code>firebasevertexai</code> in the filter box.</li>
            <li>Read your own class's sheets. No request appears: Gemini Nano answers inside Chrome.</li>
            <li>Plan a lesson. One request appears; its payload matches the Outbox above.</li>
          </ol>
          <p className="small muted">Tickmark also refuses, in code, any AI request while a student sheet is being read, any image that isn't a sample sheet, and any text containing a name from your class list.</p>
          <h3 className="section">Other requests this page makes</h3>
          <ul className="small muted">
            <li>Firebase Remote Config and Installations: operator settings such as the cloud model name. No student data.</li>
            <li>Firebase App Check with Google reCAPTCHA Enterprise: loaded only when you plan a lesson or use the sample class without on-device AI, to prove the request comes from this app.</li>
            <li>Chrome itself downloads Gemini Nano once, from Google, when you click Download.</li>
          </ul>
          <p className="small muted">Cloud requests use the free tier of the Gemini Developer API, where Google may use inputs to improve its services. That is why only anonymous class totals and made-up sample sheets are ever sent. A school deploying Tickmark can switch the project to paid Vertex AI.</p>
        </section>
        <section className="sheet">
          <h2>Data on this laptop</h2>
          <p>{est ? `${est.usedMB.toFixed(1)} MB stored in this browser${est.persisted ? ', protected from automatic clean-up' : ''}.` : '…'}</p>
          <p className="small muted">Classes, photos, marks and this log live in this browser's storage for this site. Clearing site data, or the button below, removes them.</p>
          <button className="btn danger" onClick={async () => {
            if (!window.confirm('Erase every class, photo, mark and log from this browser? This cannot be undone.')) return;
            try { await store.eraseEverything(); } catch (e) { window.alert((e as Error).message); return; }
            ledger.clear(); reload(); location.hash = '#/'; location.reload();
          }}>Erase everything</button>
          <h3 className="section">Settings</h3>
          <p className="small">Cloud model <code>{s.cloudModel}</code>. Smallest group shown <code>{s.minGroupSize}</code>. Live cloud reads for the sample class <code>{s.sampleLiveReads}</code>. Source: {s.source === 'remote' ? 'Firebase Remote Config' : 'built-in defaults'}. Remote settings can only tighten these limits. Build {BUILD.commit}.</p>
        </section>
      </div>
    </>
  );
}
