import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureAppCheck } from '../ai/firebase';
import { DEVICE_STATE_TEXT } from '../ai/gate';
import { normalizeUpload } from '../ai/images';
import { setRosterTokens, sha256Hex } from '../ai/netGuard';
import { href } from '../app/router';
import { onRun, onSheetChanged, requeueForDevice, runQuiz, runState, stopRun, type RunState } from '../app/runner';
import { scoreSheet } from '../marking/mark';
import { markRead, needsCheck } from '../marking/pipeline';
import { rosterTokens } from '../privacy/nameCheck';
import { store, uid, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { downloadDeviceModel, useDevice, useLoad } from './hooks';
import { PenPass, ScoreRing, WhereChip } from './Marks';
import { Steps } from './Steps';

export function Scan({ quizId }: { quizId: string }) {
  const [ctx, reload] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    const sheets = quiz ? await store.sheets(quiz.id) : [];
    return { quiz, cls, sheets };
  }, [quizId]);
  const [sheets, setSheets] = useState<SheetRec[]>([]);
  const [run, setRun] = useState<RunState>(runState());
  const d = useDevice();
  useEffect(() => { if (ctx) setSheets(ctx.sheets); }, [ctx]);
  useEffect(() => onRun((r) => { setRun(r); if (!r.running) reload(); }), [reload]);
  useEffect(() => onSheetChanged((s) => { if (s.quizId === quizId) setSheets((xs) => (xs.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [...xs, s])); }), [quizId]);
  useEffect(() => { if (ctx?.cls) setRosterTokens(rosterTokens(ctx.cls.roster.map((s) => s.name))); }, [ctx?.cls]);
  useWakeLock(run.running);
  useEffect(() => { if (ctx?.cls?.sample && d.state !== 'available' && d.state !== 'checking') ensureAppCheck(); }, [ctx?.cls?.sample, d.state]);

  if (!ctx) return <p className="muted">Loading…</p>;
  if (!ctx.quiz || !ctx.cls) return <p>This quiz no longer exists. <a href={href.home()}>Back to classes</a></p>;
  const { quiz, cls } = ctx;
  const mine = run.running && run.quizId === quiz.id;
  const pending = sheets.filter((s) => s.status === 'queued' || s.status === 'error' || (s.status === 'reading' && !mine));
  const toCheck = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length + ((s.status === 'read' || s.status === 'checked') && (!s.studentId || !s.nameConfident) ? 1 : 0), 0);
  const readCount = sheets.filter((s) => s.status === 'read' || s.status === 'checked').length;
  const state = d.state;
  const deviceReady = state === 'available';
  const notDevice = sheets.filter((s) => (s.status === 'read' || s.status === 'checked') && s.where !== 'on_device' && s.source === 'sample').length;
  const remainingSecs = Math.round(((run.total - run.done) * (run.avgMs || 11000)) / 1000);
  const start = (limit?: number) => runQuiz(cls, quiz, limit);

  return (
    <>
      <Steps quizId={quiz.id} at="scan" className={cls.name} />
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <h1 style={{ margin: 0 }}>{quiz.title}</h1>
        <div className="row">
          <button className="btn ghost" onClick={() => { document.body.classList.add('printing-quiz'); const off = () => { document.body.classList.remove('printing-quiz'); removeEventListener('afterprint', off); }; addEventListener('afterprint', off); window.print(); }}>Print blank quiz</button>
          <a className={`btn ${toCheck ? 'primary' : ''}`} href={href.check(quiz.id)}>{toCheck ? `Check ${toCheck} flagged item${toCheck === 1 ? '' : 's'}` : 'Check answers'}</a>
          <a className={`btn ${toCheck ? '' : 'primary'}`} href={href.results(quiz.id)}>Results</a>
        </div>
      </div>

      {cls.sample && (
        <p className="callout" style={{ marginTop: 16 }}>
          These 28 worksheets are made up: invented names, handwriting drawn with open-licence handwriting fonts, and mistakes planted on purpose.
          {deviceReady ? ' They are read by Gemini Nano on this laptop, exactly like a real class.' : ' Without on-device AI here, the first 3 are read live by cloud Gemini (allowed only because they are made-up sheets) and the rest use cloud readings recorded on 15 Nov.'}
        </p>
      )}

      {!run.running && cls.sample && deviceReady && notDevice > 0 && (
        <p className="callout device" style={{ marginTop: 12 }}>
          Gemini Nano is ready now. {notDevice} sheet{notDevice === 1 ? ' was' : 's were'} read by cloud Gemini or from recordings.{' '}
          <button className="btn small primary" onClick={async () => { await requeueForDevice(quiz.id); reload(); setTimeout(() => start(), 0); }}>Read {notDevice === 1 ? 'it' : `these ${notDevice}`} again on this laptop</button>
        </p>
      )}

      <section className="sheet section" style={{ marginTop: 16 }}>
        {mine ? (
          <div className="stack" role="status" aria-live="polite">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Reading sheet {Math.min(run.done + 1, run.total || 1)} of {run.total || '…'}{deviceReady ? ' on this laptop' : ''}…</strong>
              <span className="muted small">about {remainingSecs >= 60 ? `${Math.round(remainingSecs / 60)} min` : `${remainingSecs} s`} left</span>
              <button className="btn small" onClick={stopRun}>Stop</button>
            </div>
            <div className="progress"><i style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} /></div>
          </div>
        ) : run.running ? (
          <p className="muted" style={{ margin: 0 }}>Another quiz is being read right now. It will carry on in the background; start this one when it finishes.</p>
        ) : pending.length > 0 ? (
          <ReadControls n={pending.length} total={sheets.length} sample={!!cls.sample} state={state} progress={d.progress} onStart={start} />
        ) : readCount ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>All {readCount} sheets read.</strong>
            <span className="muted">{toCheck ? `${toCheck} item${toCheck === 1 ? ' is' : 's are'} waiting for you in Check answers.` : 'Nothing left to check.'}</span>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>{deviceReady || state === 'downloading' || state === 'downloadable' ? 'Add photos of the worksheets below, one photo per student.' : 'Type each student\'s answers below.'}</p>
        )}
        {run.error && run.quizId === quiz.id && <p className="callout bad" role="alert" style={{ marginTop: 12 }}>{run.error}</p>}
      </section>

      {!cls.sample && (state === 'available' || state === 'downloading' || state === 'downloadable' || state === 'checking'
        ? <DropPhotos quiz={quiz} existing={sheets} onAdded={reload} compact={readCount > 0 && pending.length === 0} />
        : <TypedGrid cls={cls} quiz={quiz} existing={sheets} onSaved={reload} />)}

      <PrintableQuiz quiz={quiz} className={cls.sample ? undefined : cls.name} />

      {sheets.length > 0 && (
        <section className="section">
          <h2>Sheets</h2>
          <div className="tiles">
            {sheets.map((s) => <Tile key={s.id} s={s} cls={cls} quiz={quiz} onRetry={() => start()} canRetry={!run.running} />)}
          </div>
        </section>
      )}
    </>
  );
}

function ReadControls({ n, total, sample, state, progress, onStart }: { n: number; total: number; sample: boolean; state: string; progress: number | null; onStart: (limit?: number) => void }) {
  const label = n === total ? 'all' : 'the rest';
  const minutes = Math.max(1, Math.round((n * 12) / 60));
  if (state === 'available') {
    return (
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><strong>{n} sheet{n === 1 ? '' : 's'} waiting to be read.</strong><div className="muted small">About {minutes} min on this laptop. Nothing is uploaded.</div></div>
        <div className="row">
          {sample && n > 8 && <button className="btn" onClick={() => onStart(8)}>Quick look: read 8</button>}
          <button className="btn primary" onClick={() => onStart()}>Read {label}</button>
        </div>
      </div>
    );
  }
  const pct = progress !== null ? Math.round(progress * 100) : null;
  if (state === 'downloading' || state === 'downloadable') {
    return (
      <div className="stack">
        <div><strong>{n} sheet{n === 1 ? '' : 's'} waiting.</strong> <span className="muted">{state === 'downloading' ? `Gemini Nano is downloading${pct !== null ? ` (${pct >= 90 ? 'unpacking' : `${pct}%`})` : ''}. Sheets will be read on this laptop when it's ready.` : 'Gemini Nano is not downloaded yet.'}</span></div>
        {state === 'downloading' && pct !== null && <div className="progress"><i style={{ width: `${pct}%` }} /></div>}
        <div className="row">
          {state === 'downloadable' && <button className="btn primary" onClick={() => downloadDeviceModel()}>Download Gemini Nano (about 5 min)</button>}
          {sample && <button className="btn" onClick={() => onStart(n > 8 ? 8 : undefined)}>Read now with recorded readings</button>}
        </div>
      </div>
    );
  }
  if (sample) {
    return (
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div><strong>{n} sheets waiting.</strong><div className="muted small">{DEVICE_STATE_TEXT[state as keyof typeof DEVICE_STATE_TEXT]?.title ?? 'Checking on-device AI'}. The sample uses cloud Gemini for 3 sheets and recorded readings for the rest.</div></div>
        <button className="btn primary" onClick={() => onStart()} disabled={state === 'checking'}>Read {label}</button>
      </div>
    );
  }
  return <p className="muted" style={{ margin: 0 }}>{n} photo{n === 1 ? '' : 's'} saved. Student sheets are read only by on-device AI, which isn't available in this browser; type the answers in below instead.</p>;
}

function Tile({ s, cls, quiz, onRetry, canRetry }: { s: SheetRec; cls: ClassRec; quiz: QuizRec; onRetry: () => void; canRetry: boolean }) {
  const [url, setUrl] = useState<string | null>(s.sampleId ? `/samples/${s.sampleId}.jpg` : null);
  useEffect(() => {
    if (s.sampleId) { setUrl(`/samples/${s.sampleId}.jpg`); return; }
    if (!s.imageId) { setUrl(null); return; }
    let alive = true, u: string | null = null;
    setUrl(null);
    store.image(s.imageId).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [s.imageId, s.sampleId]);
  const student = cls.roster.find((r) => r.id === s.studentId);
  const done = s.status === 'read' || s.status === 'checked';
  const prev = useRef(s.status);
  const [play, setPlay] = useState(false);
  useEffect(() => { if (prev.current === 'reading' && done) setPlay(true); prev.current = s.status; }, [s.status, done]);
  const score = done ? scoreSheet(s.marks, quiz.unsimplifiedCredit) : null;
  const flags = s.marks.filter(needsCheck).length;
  const body = (
    <>
      <div className="mark-sheet">
        {url ? <img src={url} alt="" loading="lazy" /> : <div style={{ aspectRatio: '1100/1492', display: 'grid', placeItems: 'center' }} className="muted small">{s.source === 'typed' ? 'Typed in' : ''}</div>}
        {s.sampleId && done && <PenPass play={play} marks={s.marks.map((m) => ({ status: m.status, flag: needsCheck(m) }))} />}
        {score && <ScoreRing points={score.points} outOf={score.outOf} draw={play} unknown={score.unreadable > 0} />}
      </div>
      <span className="name">{student?.name ?? (s.readName ? `"${s.readName}"` : s.status === 'queued' ? 'Waiting' : s.status === 'reading' ? 'Reading…' : s.status === 'error' ? 'Not read yet' : 'Name not found')}</span>
      <span className="meta">
        {s.status === 'reading' && <span className="pill device">Reading…</span>}
        {done && <WhereChip where={s.source === 'typed' ? 'typed' : s.where} ms={s.ms} short />}
        {flags > 0 && <span className="flag">{flags} to check</span>}
        {done && (!s.studentId || !s.nameConfident) && <span className="flag">Confirm name</span>}
      </span>
      {s.status === 'error' && <span className="small" style={{ color: 'var(--red)' }}>{s.error}</span>}
    </>
  );
  if (!done) {
    return (
      <div className={`tile ${s.status}`}>
        {body}
        {s.status === 'error' && canRetry && <button className="btn small" onClick={onRetry}>Try again</button>}
      </div>
    );
  }
  return <a className={`tile ${s.status}`} href={href.check(quiz.id, s.id)}>{body}</a>;
}

function DropPhotos({ quiz, existing, onAdded, compact = false }: { quiz: QuizRec; existing: SheetRec[]; onAdded: () => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const errs: string[] = [];
    const seen = new Set(existing.map((s) => s.imageSha).filter(Boolean));
    let n = 0, dup = 0;
    navigator.storage?.persist?.().catch(() => undefined);
    setAdding({ done: 0, total: list.length });
    for (const [i, f] of list.entries()) {
      try {
        const blob = await normalizeUpload(f);
        const sha = await sha256Hex(await blob.arrayBuffer());
        if (seen.has(sha)) { dup++; continue; }
        seen.add(sha);
        const imageId = uid('img');
        await store.putImage(imageId, blob);
        await store.putSheet({ id: uid('sh'), quizId: quiz.id, imageId, imageSha: sha, source: 'photo', fileName: f.name, status: 'queued', studentId: null, nameConfident: false, readName: '', marks: [], createdAt: Date.now() + i });
        n++;
      } catch (e) { errs.push((e as Error).name === 'QuotaExceededError' ? 'This browser is out of storage space.' : (e as Error).message); }
      setAdding({ done: i + 1, total: list.length });
    }
    setAdding(null);
    setMsg([`Added ${n} photo${n === 1 ? '' : 's'}.${dup ? ` Skipped ${dup} already added.` : ''}`, ...errs]);
    onAdded();
  };
  return (
    <section className="section">
      <div className={`dropzone ${over ? 'over' : ''} ${compact ? 'compact' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <p style={{ margin: compact ? 0 : '0 auto 10px', fontWeight: 700 }}>{compact ? 'Drop more photos here, or' : 'Drop worksheet photos here, one photo per student.'}</p>
        {!compact && <p className="muted small" style={{ margin: '0 auto 12px' }}>JPEG, PNG or WebP. Photos are straightened, resized and their location data removed on this laptop, then kept in this browser only. Tip: AirDrop, Nearby Share or a USB cable moves phone photos to the laptop without a cloud album.</p>}
        <button className="btn" onClick={() => input.current?.click()} disabled={!!adding}>{adding ? `Adding ${adding.done} of ${adding.total}…` : 'Choose photos'}</button>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
      </div>
      {msg.length > 0 && <ul className="small" aria-live="polite">{msg.map((m, i) => <li key={i}>{m}</li>)}</ul>}
    </section>
  );
}

function TypedGrid({ cls, quiz, existing, onSaved }: { cls: ClassRec; quiz: QuizRec; existing: SheetRec[]; onSaved: () => void }) {
  const initial = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const st of cls.roster) {
      const sh = existing.find((s) => s.studentId === st.id && s.source === 'typed');
      m[st.id] = quiz.keys.map((k) => sh?.marks.find((x) => x.q === k.q)?.read ?? '');
    }
    return m;
  }, [cls, quiz, existing]);
  const [vals, setVals] = useState(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const save = async () => {
    let n = 0;
    for (const st of cls.roster) {
      const answers = vals[st.id];
      if (!answers.some((a) => a.trim())) continue;
      const prev = existing.find((s) => s.studentId === st.id && s.source === 'typed');
      const marks = markRead(quiz.keys, { answers: answers.map((a, i) => ({ q: quiz.keys[i].q, crossedOutText: '', finalAnswer: a })) }).map((m) => ({ ...m, checked: m.status !== 'unreadable' }));
      await store.putSheet({ id: prev?.id ?? uid('sh'), quizId: quiz.id, source: 'typed', status: marks.every((m) => m.checked) ? 'checked' : 'read', studentId: st.id, nameConfident: true, readName: st.name, marks, where: 'local', createdAt: prev?.createdAt ?? Date.now() });
      n++;
    }
    setSaved(`Marked ${n} student${n === 1 ? '' : 's'}.`);
    onSaved();
  };
  return (
    <section className="sheet section">
      <h2>Type the answers in</h2>
      <p className="muted">This browser can't read photos on the laptop, and student sheets are never sent to the cloud. Type what each student wrote: Tickmark still marks every answer and names each mistake, right here.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="plain">
          <thead><tr><th>Student</th>{quiz.keys.map((k) => <th key={k.q} title={k.prompt}>Q{k.q}</th>)}</tr></thead>
          <tbody>
            {cls.roster.map((st) => (
              <tr key={st.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{st.name}</td>
                {quiz.keys.map((k, i) => (
                  <td key={k.q}>
                    <input data-student aria-label={`${st.name}, question ${k.q}`} value={vals[st.id]?.[i] ?? ''} spellCheck={false} autoComplete="off" style={{ width: '5.5em', minHeight: 32 }}
                      onChange={(e) => setVals({ ...vals, [st.id]: (vals[st.id] ?? quiz.keys.map(() => '')).map((v, j) => (j === i ? e.target.value : v)) })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={save}>Mark typed answers</button>
        {saved && <span className="muted" role="status">{saved} See Results.</span>}
      </div>
    </section>
  );
}

/** Keeps the screen awake during a long reading run, where supported. */
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { lock?.release().catch(() => undefined); };
  }, [on]);
}

/** A clean worksheet to print: name line, numbered questions, room to answer. Real handwriting can then be tested. */
function PrintableQuiz({ quiz, className }: { quiz: QuizRec; className?: string }) {
  return (
    <section className="print-only printable-quiz" aria-hidden="true">
      <div className="pq-head"><b>{quiz.title}{className ? ` (${className})` : ''}</b><span>Name: ______________________</span></div>
      <p>Write each answer in its simplest form.</p>
      <ol>{quiz.keys.map((k) => <li key={k.q}>{k.prompt || '____________'} = <span className="pq-line" /></li>)}</ol>
    </section>
  );
}
