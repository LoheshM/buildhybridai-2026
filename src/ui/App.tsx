import { BUILD } from '../config';
import { href, useRoute } from '../app/router';
import { downloadDeviceModel, useCounters, useDevice } from './hooks';
import { Logo } from './Marks';
import { Welcome } from './Welcome';
import { Home } from './Home';
import { NewQuiz } from './NewQuiz';
import { Scan } from './Scan';
import { Check } from './Check';
import { Results } from './Results';
import { Reteach } from './Reteach';
import { Privacy } from './Privacy';

export function App() {
  const r = useRoute();
  const page = (() => {
    switch (r.page) {
      case 'welcome': return <Welcome />;
      case 'home': return <Home />;
      case 'new': return <NewQuiz />;
      case 'scan': return <Scan quizId={r.quizId} />;
      case 'check': return <Check quizId={r.quizId} sheetId={r.sheetId} />;
      case 'results': return <Results quizId={r.quizId} />;
      case 'reteach': return <Reteach quizId={r.quizId} />;
      case 'privacy': return <Privacy />;
    }
  })();
  const inClasses = r.page !== 'welcome' && r.page !== 'privacy';
  return (
    <div className="shell">
      <header className="topbar">
        <a className="brand" href={href.welcome()} aria-label="Tickmark home"><Logo />Tickmark</a>
        <nav className="topnav" aria-label="Main">
          <a href={href.home()} aria-current={inClasses ? 'page' : undefined}>Classes</a>
          <a href={href.privacy()} aria-current={r.page === 'privacy' ? 'page' : undefined}>Privacy &amp; data</a>
        </nav>
        <span className="spacer" />
        <DevicePill />
        <CloudCounter />
      </header>
      <main id="main">{page}</main>
      <footer className="foot">
        Tickmark is open source (Apache-2.0). Build {BUILD.commit}{BUILD.date ? ` (${BUILD.date})` : ''}. Protected by reCAPTCHA Enterprise and Firebase App Check;
        Google's <a href="https://policies.google.com/privacy">Privacy Policy</a> and <a href="https://policies.google.com/terms">Terms</a> apply.
      </footer>
    </div>
  );
}

function DevicePill() {
  const d = useDevice();
  if (d.state === 'checking') return <span className="pill">Checking on-device AI…</span>;
  if (d.state === 'available') return <span className="pill device" title="Gemini Nano runs in Chrome on this laptop"><span className="dot" />{d.warming ? 'Warming up on-device AI…' : 'On-device AI ready'}</span>;
  if (d.state === 'downloading') {
    const pct = d.progress !== null ? Math.round(d.progress * 100) : null;
    return <span className="pill warn" role="status">{pct !== null && pct >= 90 ? 'Unpacking Gemini Nano…' : `Downloading Gemini Nano${pct !== null ? ` ${pct}%` : '…'}`}</span>;
  }
  if (d.state === 'downloadable') return <button className="pill warn" onClick={() => downloadDeviceModel()}>Download on-device AI</button>;
  return <a className="pill bad" href={href.welcome()} title="Student sheets can only be read on a laptop that runs Gemini Nano">No on-device AI here</a>;
}

function CloudCounter() {
  const c = useCounters();
  return (
    <a className="counter" href={href.privacy()} title="Everything that left this browser. Open to see each request.">
      <span>Sent to cloud <b>{c.cloudRequests}</b></span>
      <span>Student photos <b className="zero">{c.studentPhotosSent}</b></span>
      {c.blocked > 0 && <span style={{ color: 'var(--red)' }}>Blocked <b>{c.blocked}</b></span>}
    </a>
  );
}
