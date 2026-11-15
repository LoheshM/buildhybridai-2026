import { useEffect, useState } from 'react';
import { BUILD } from '../config';
import { bootError } from '../app/boot';
import { currentTheme, setTheme, type Theme } from '../app/theme';
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
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { const on = () => setBlocked(true); addEventListener('tickmark:db-blocked', on); return () => removeEventListener('tickmark:db-blocked', on); }, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { const on = (e: Event) => setSaveError((e as CustomEvent).detail ?? 'unknown error'); addEventListener('tickmark:save-failed', on); return () => removeEventListener('tickmark:save-failed', on); }, []);
  useEffect(() => {
    const titles: Record<string, string> = { welcome: 'Tickmark', home: 'Classes', new: 'New class and quiz', scan: 'Sheets', check: 'Check answers', results: 'Results', reteach: "Plan tomorrow's lesson", privacy: 'Privacy & data' };
    document.title = r.page === 'welcome' ? 'Tickmark' : `${titles[r.page]} | Tickmark`;
  }, [r.page]);
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
      <a className="sr-only" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="brand" href={href.welcome()} aria-label="Tickmark home"><Logo />Tickmark</a>
        <nav className="topnav" aria-label="Main">
          <a href={href.home()} aria-current={inClasses ? 'page' : undefined}>Classes</a>
          <a href={href.privacy()} aria-current={r.page === 'privacy' ? 'page' : undefined}>Privacy &amp; data</a>
        </nav>
        <span className="spacer" />
        <ThemeToggle />
        <DevicePill />
        <CloudCounter />
      </header>
      <main id="main">
        {bootError && <p className="callout bad" role="alert">{bootError} <button className="btn small" onClick={() => location.reload()}>Reload</button></p>}
        {saveError && <p className="callout bad" role="alert">A change could not be saved in this browser ({saveError}). Free some space or reload, then check the last answer again.</p>}
        {blocked && <p className="callout" role="alert">Tickmark was changed in another tab. <button className="btn small" onClick={() => location.reload()}>Reload this tab</button></p>}
        {page}
      </main>
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
  if (d.state === 'downloadable') return <button className="btn small primary" onClick={() => downloadDeviceModel()}>Download on-device AI</button>;
  if (d.state === 'no_image') return <a className="pill warn" href={href.welcome()} title="Turn on image input in chrome://flags">Image reading is off</a>;
  return <a className="pill" href={href.welcome()} title="This browser can't run Gemini Nano. The sample class still works; your own classes use typed answers.">Sample: cloud mode</a>;
}

function CloudCounter() {
  const c = useCounters();
  return (
    <a className="counter" href={href.privacy()} title="Requests sent to the AI service, counted in this browser. Open to see each one.">
      <span>Sent to cloud AI <b>{c.cloudRequests}</b></span>
      <span>Student photos sent <b className={c.studentPhotosSent ? '' : 'zero'}>{c.studentPhotosSent}</b></span>
      {c.blocked > 0 && <span style={{ color: 'var(--red)' }}>Blocked <b>{c.blocked}</b></span>}
    </a>
  );
}

function ThemeToggle() {
  const [t, setT] = useState<Theme>(currentTheme());
  const next: Theme = t === 'dark' ? 'light' : 'dark';
  return (
    <button className="btn small ghost" aria-pressed={t === 'dark'} aria-label={t === 'dark' ? 'Switch to the light paper look' : 'Switch to the dark chalkboard look'} title={t === 'dark' ? 'Paper look' : 'Chalkboard look'} onClick={() => { setTheme(next); setT(next); }}>
      <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{t === 'dark' ? '☀' : '☾'}</span>
    </button>
  );
}
