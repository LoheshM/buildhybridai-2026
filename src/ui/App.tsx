import { useEffect, useState } from 'react';
import { BUILD } from '../config';
import { bootError } from '../app/boot';
import { currentTheme, setTheme, type Theme } from '../app/theme';
import { href, useRoute, type Route } from '../app/router';
import { onSheetChanged } from '../app/runner';
import { needsCheck } from '../marking/pipeline';
import { store } from '../store/db';
import { downloadDeviceModel, useCounters, useDevice, useLoad } from './hooks';
import { Icon, Logo } from './Marks';
import { Welcome } from './Welcome';
import { Home } from './Home';
import { NewQuiz } from './NewQuiz';
import { Scan } from './Scan';
import { Check } from './Check';
import { Results } from './Results';
import { Reteach } from './Reteach';
import { Privacy } from './Privacy';

const TITLES: Record<Route['page'], string> = { welcome: 'Tickmark', home: 'Classes', new: 'New quiz', scan: 'Sheets', check: 'Check', results: 'Results', reteach: 'Plan the lesson', privacy: 'Privacy and data' };

export function App() {
  const r = useRoute();
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { const on = () => setBlocked(true); addEventListener('tickmark:db-blocked', on); return () => removeEventListener('tickmark:db-blocked', on); }, []);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { const on = (e: Event) => setSaveError((e as CustomEvent).detail ?? 'unknown error'); addEventListener('tickmark:save-failed', on); return () => removeEventListener('tickmark:save-failed', on); }, []);
  useEffect(() => { document.title = r.page === 'welcome' ? 'Tickmark: mark the pile on this laptop' : `${TITLES[r.page]} | Tickmark`; }, [r.page]);
  const quizId = 'quizId' in r ? r.quizId : null;
  const page = (() => {
    switch (r.page) {
      case 'welcome': return <Welcome />;
      case 'home': return <Home />;
      case 'new': return <NewQuiz />;
      case 'scan': return <Scan quizId={r.quizId} />;
      case 'check': return <Check quizId={r.quizId} sheetId={r.sheetId} q={r.q} />;
      case 'results': return <Results quizId={r.quizId} />;
      case 'reteach': return <Reteach quizId={r.quizId} />;
      case 'privacy': return <Privacy />;
    }
  })();
  const inClasses = r.page !== 'welcome' && r.page !== 'privacy';
  return (
    <div className="shell">
      <a className="skip" href="#main">Skip to content</a>
      <header className="topbar">
        <a className="brand" href={href.welcome()} aria-label="Tickmark home"><Logo /><span className="word">Tickmark</span></a>
        <nav className="topnav" aria-label="Main">
          <a href={href.home()} aria-current={inClasses ? 'page' : undefined}>Classes</a>
          <a href={href.privacy()} aria-current={r.page === 'privacy' ? 'page' : undefined}>Privacy</a>
        </nav>
        <span className="spacer" />
        <div className="status">
          <DeviceLight />
          <CloudCounter />
          <ThemeToggle />
        </div>
      </header>
      {quizId && <QuizBar quizId={quizId} at={r.page as 'scan' | 'check' | 'results' | 'reteach'} />}
      <main id="main" tabIndex={-1}>
        {bootError && <Notice tone="bad">{bootError} <button className="btn small" onClick={() => location.reload()}>Reload</button></Notice>}
        {saveError && <Notice tone="bad">A change couldn't be saved in this browser ({saveError}). Free some space or reload, then check the last answer again.</Notice>}
        {blocked && <Notice>Tickmark was changed in another tab. <button className="btn small" onClick={() => location.reload()}>Reload this tab</button></Notice>}
        {page}
      </main>
      <footer className="foot">
        Tickmark is open source (Apache-2.0). Build {BUILD.commit}{BUILD.date ? ` (${BUILD.date})` : ''}. Cloud requests are protected by reCAPTCHA Enterprise and Firebase App Check;
        Google's <a href="https://policies.google.com/privacy">Privacy Policy</a> and <a href="https://policies.google.com/terms">Terms</a> apply.
      </footer>
    </div>
  );
}

export function Notice({ tone, children }: { tone?: 'bad' | 'warn' | 'device'; children: React.ReactNode }) {
  return <div className={`callout${tone ? ` ${tone}` : ''}`} role={tone === 'bad' ? 'alert' : 'status'}><Icon name={tone === 'device' ? 'laptop' : tone === 'bad' || tone === 'warn' ? 'alert' : 'info'} /><div>{children}</div></div>;
}

/** Which class and quiz, and the four steps of marking it. Lives above every quiz page. */
function QuizBar({ quizId, at }: { quizId: string; at: 'scan' | 'check' | 'results' | 'reteach' }) {
  const [ctx, reload] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    const sheets = quiz ? await store.sheets(quizId) : [];
    return { quiz, cls, toCheck: sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length + ((s.status === 'read' || s.status === 'checked') && (!s.studentId || !s.nameConfident) ? 1 : 0), 0) };
  }, [quizId, at]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onSheetChanged((s) => { if (s.quizId === quizId) { clearTimeout(t); t = setTimeout(reload, 400); } });
    const onSaved = () => { clearTimeout(t); t = setTimeout(reload, 400); };
    addEventListener('tickmark:marks-changed', onSaved);
    return () => { off(); clearTimeout(t); removeEventListener('tickmark:marks-changed', onSaved); };
  }, [quizId, reload]);
  if (!ctx?.quiz || !ctx.cls) return null;
  const tabs = [['scan', 'Sheets'], ['check', 'Check'], ['results', 'Results'], ['reteach', 'Plan the lesson']] as const;
  return (
    <div className="ctxbar">
      <div className="ctxbar-in">
        <div className="ctx-title">
          <a className="cls" href={href.home()}>{ctx.cls.name}{ctx.cls.sample ? ' · made-up class' : ''}</a>
          <h1 className="clip">{ctx.quiz.title}</h1>
        </div>
        <nav aria-label="Marking steps" className="grow">
          <ul className="tabs">
            {tabs.map(([k, label]) => (
              <li key={k}><a href={href[k](quizId)} aria-current={k === at ? 'page' : undefined}>{label}{k === 'check' && ctx.toCheck > 0 && <span className="count" aria-label={`${ctx.toCheck} waiting`}>{ctx.toCheck}</span>}</a></li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

function DeviceLight() {
  const d = useDevice();
  if (d.state === 'checking') return <span className="light"><i /><span className="lt">Checking on-device AI</span></span>;
  if (d.state === 'available') return <span className="light device" title="Gemini Nano runs in Chrome on this laptop"><i /><span className="lt">{d.warming ? 'Warming up Gemini Nano' : 'Gemini Nano ready'}</span></span>;
  if (d.state === 'downloading') {
    const pct = d.progress !== null ? Math.round(d.progress * 100) : null;
    return <span className="light warn" role="status"><i /><span className="lt">{pct !== null && pct >= 90 ? 'Unpacking Gemini Nano' : `Downloading Gemini Nano${pct !== null ? ` ${pct}%` : ''}`}</span></span>;
  }
  if (d.state === 'downloadable') return <button className="light warn" onClick={() => downloadDeviceModel()}><i />Download Gemini Nano</button>;
  if (d.state === 'not_responding') return <button className="light bad" onClick={() => location.reload()} title="Chrome's on-device model stopped answering"><i />Gemini Nano stuck: reload</button>;
  if (d.state === 'no_image') return <a className="light warn" href={href.welcome()} title="Turn on image input in chrome://flags"><i /><span className="lt">Image reading off</span></a>;
  return <a className="light" href={href.welcome()} title="This browser can't run Gemini Nano. The sample classes still work; your own classes use typed answers."><i /><span className="lt">No on-device AI</span></a>;
}

function CloudCounter() {
  const c = useCounters();
  return (
    <a className="counter" href={href.privacy()} title="Requests sent to the AI service from this browser. Open to see each one.">
      <span className="long">Sent to cloud<b>{c.cloudRequests}</b></span>
      <span>Pupil photos sent<b className={c.studentPhotosSent ? '' : 'zero'}>{c.studentPhotosSent}</b></span>
    </a>
  );
}

function ThemeToggle() {
  const [t, setT] = useState<Theme>(currentTheme());
  const next: Theme = t === 'dark' ? 'light' : 'dark';
  return (
    <button className="iconbtn" aria-pressed={t === 'dark'} aria-label={t === 'dark' ? 'Use the light look' : 'Use the dark look'} title={t === 'dark' ? 'Light look' : 'Dark look'} onClick={() => { setTheme(next); setT(next); }}>
      <Icon name={t === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
