import { useEffect, useMemo, useRef, useState } from 'react';
import { ensureAppCheck } from '../ai/firebase';
import { DEVICE_STATE_TEXT } from '../ai/gate';
import { normalizeUpload } from '../ai/images';
import { setRosterTokens, sha256Hex } from '../ai/netGuard';
import { samplePhotoUrl } from '../app/boot';
import { href } from '../app/router';
import { onRun, onSheetChanged, requeueForDevice, runQuiz, runState, stopRun, type RunState } from '../app/runner';
import { scoreSheet, typeOf } from '../marking/mark';
import { markRead, needsCheck } from '../marking/pipeline';
import { isOpen } from '../marking/qtypes';
import { rosterTokens } from '../privacy/nameCheck';
import { store, uid, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { downloadDeviceModel, useDevice, useLoad } from './hooks';
import { Notice } from './App';
import { AnswerMark, Icon, ScoreRing, WhereChip } from './Marks';
import { AnswerSheet } from './AnswerSheet';

export function Scan({ quizId }: { quizId: string }) {
  const [ctx, reload] = useLoad(async () => {
    const quiz = await store.quiz(quizId);
    const cls = quiz ? await store.class(quiz.classId) : undefined;
    const sheets = quiz ? await store.sheets(quiz.id) : [];
    return { quiz, cls, sheets };
  }, [quizId]);
  const [sheets, setSheets] = useState<SheetRec[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [run, setRun] = useState<RunState>(runState());
  const d = useDevice();
  useEffect(() => { if (ctx) setSheets(ctx.sheets); }, [ctx]);
  useEffect(() => onRun((r) => { setRun(r); if (!r.running) reload(); }), [reload]);
  useEffect(() => onSheetChanged((s) => {
    if (s.quizId !== quizId) return;
    setSheets((xs) => (xs.some((x) => x.id === s.id) ? xs.map((x) => (x.id === s.id ? s : x)) : [...xs, s]));
    if (s.status === 'read') setFresh((f) => new Set(f).add(s.id)); // stays highlighted until visited
  }), [quizId]);
  useEffect(() => { if (ctx?.cls) setRosterTokens(rosterTokens(ctx.cls.roster.map((s) => s.name))); }, [ctx?.cls]);
  useWakeLock(run.running);
  useEffect(() => { if (ctx?.cls?.sample && d.state !== 'available' && d.state !== 'checking') ensureAppCheck(); }, [ctx?.cls?.sample, d.state]);

  if (!ctx) return <p className="muted">Loading sheets…</p>;
  if (!ctx.quiz || !ctx.cls) return <p>This quiz no longer exists. <a href={href.home()}>Back to classes</a></p>;
  const { quiz, cls } = ctx;
  const mine = run.running && run.quizId === quiz.id;
  const pending = sheets.filter((s) => s.status === 'queued' || s.status === 'error' || (s.status === 'reading' && !mine));
  const read = sheets.filter((s) => s.status === 'read' || s.status === 'checked');
  const answersToCheck = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const namesToCheck = read.filter((s) => !s.studentId || !s.nameConfident).length;
  const pencil = sheets.reduce((n, s) => n + s.marks.filter((m) => m.status === 'pending').length, 0);
  const deviceReady = d.state === 'available';
  const notDevice = read.filter((s) => s.where !== 'on_device' && s.source === 'sample').length;
  const remaining = Math.round(((run.total - run.done) * (run.avgMs || 9000)) / 1000);
  const start = (limit?: number) => runQuiz(cls, quiz, limit);
  const openQs = quiz.keys.filter((k) => isOpen(typeOf(k))).length;

  return (
    <>
      {cls.sample && (
        <Notice>
          <p>These {sheets.length} answer sheets are made up: invented names, handwriting from open-licence fonts, mistakes planted on purpose.
            {deviceReady ? ' Gemini Nano reads them on this laptop, exactly like a real class.' : ' Without on-device AI here, the first 3 are read live by cloud Gemini (allowed only because they are made up) and the rest use cloud readings recorded on 16 Nov.'}</p>
        </Notice>
      )}
      {!run.running && cls.sample && deviceReady && notDevice > 0 && (
        <Notice tone="device">
          <p>Gemini Nano is ready now. {notDevice} sheet{notDevice === 1 ? ' was' : 's were'} read by cloud Gemini or from recordings.</p>
          <div className="row"><button className="btn small primary" onClick={async () => { await requeueForDevice(quiz.id); reload(); setTimeout(() => start(), 0); }}>Read {notDevice === 1 ? 'it' : `these ${notDevice}`} again on this laptop</button></div>
        </Notice>
      )}

      <section className="panel runbox" aria-label="Reading">
        {mine ? (
          <div className="stack" role="status" aria-live="polite">
            <div className="row spread">
              <strong>Reading sheet {Math.min(run.done + 1, run.total || 1)} of {run.total || '…'}{deviceReady ? ' on this laptop' : ''}</strong>
              <span className="small muted">about {remaining >= 60 ? `${Math.round(remaining / 60)} min` : `${remaining} s`} left{openQs ? `, including ${openQs} suggested mark${openQs === 1 ? '' : 's'} per sheet` : ''}</span>
              <button className="btn small" onClick={stopRun}>Stop</button>
            </div>
            <div className="progress"><i style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} /></div>
          </div>
        ) : run.running ? (
          <p className="muted" style={{ margin: 0 }}>Another quiz is being read right now. Start this one when it finishes.</p>
        ) : pending.length > 0 ? (
          <ReadControls n={pending.length} total={sheets.length} sample={!!cls.sample} state={d.state} progress={d.progress} onStart={start} />
        ) : read.length ? (
          <div className="row spread">
            <div>
              <strong>All {read.length} sheets read.</strong>
              <div className="small muted">{answersToCheck + namesToCheck ? `${pencil ? `${pencil} pencil mark${pencil === 1 ? '' : 's'}` : ''}${pencil && answersToCheck - pencil ? ' and ' : ''}${answersToCheck - pencil ? `${answersToCheck - pencil} flagged answer${answersToCheck - pencil === 1 ? '' : 's'}` : ''}${namesToCheck ? `${answersToCheck ? ', ' : ''}${namesToCheck} name${namesToCheck === 1 ? '' : 's'}` : ''} waiting for you.` : 'Everything is decided.'}</div>
            </div>
            <a className="btn primary" href={answersToCheck + namesToCheck ? href.check(quiz.id) : href.results(quiz.id)}>{answersToCheck + namesToCheck ? 'Check them' : 'See results'}</a>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>{deviceReady || d.state === 'downloading' || d.state === 'downloadable' ? 'Add one photo of each answer sheet below.' : "Type each pupil's answers below."}</p>
        )}
        {run.error && run.quizId === quiz.id && <Notice tone="bad">{run.error}</Notice>}
      </section>

      {!cls.sample && (d.state === 'available' || d.state === 'downloading' || d.state === 'downloadable' || d.state === 'checking'
        ? <DropPhotos quiz={quiz} existing={sheets} onAdded={reload} compact={read.length > 0 && pending.length === 0} />
        : <TypedGrid cls={cls} quiz={quiz} existing={sheets} onSaved={reload} />)}

      {!cls.sample && sheets.length === 0 && (
        <Notice>
          <p><strong>First, print the answer sheet.</strong> Pupils answer your worksheet in its numbered boxes. Tickmark finds the boxes by the four black squares and reads one box at a time, so Gemini Nano copies what each pupil wrote instead of answering the question itself.</p>
          <div className="row"><button className="btn primary small" onClick={() => printBlank()}>Print the answer sheet</button></div>
        </Notice>
      )}
      {!cls.sample && sheets.length > 0 && <div className="row mt"><button className="btn small quiet" onClick={() => printBlank()}>Print the answer sheet</button></div>}
      <AnswerSheet quiz={quiz} className={cls.sample ? undefined : cls.name} />

      {sheets.length > 0 && (
        <section className="section" aria-labelledby="sheets-h">
          <div className="panel-head">
            <h2 id="sheets-h">Sheets</h2>
            <span className="small muted">Ink: decided · pencil: suggested, waiting for you · highlighter: needs a look</span>
          </div>
          <div className="tiles">
            {sheets.map((s) => <Tile key={s.id} s={s} cls={cls} quiz={quiz} fresh={fresh.has(s.id)} onRetry={() => start()} canRetry={!run.running} />)}
          </div>
        </section>
      )}
    </>
  );
}

function printBlank() {
  document.body.classList.add('printing-quiz');
  const off = () => { document.body.classList.remove('printing-quiz'); removeEventListener('afterprint', off); };
  addEventListener('afterprint', off);
  window.print();
}

function ReadControls({ n, total, sample, state, progress, onStart }: { n: number; total: number; sample: boolean; state: string; progress: number | null; onStart: (limit?: number) => void }) {
  const label = n === total ? 'all' : 'the rest';
  const minutes = Math.max(1, Math.round((n * 9) / 60));
  if (state === 'available') {
    return (
      <div className="row spread">
        <div><strong>{n} sheet{n === 1 ? '' : 's'} waiting to be read.</strong><div className="small muted">About {minutes} min on this laptop. Nothing is uploaded.</div></div>
        <div className="row">
          {sample && n > 6 && <button className="btn" onClick={() => onStart(6)}>Quick look: read 6</button>}
          <button className="btn primary" onClick={() => onStart()}>Read {label}</button>
        </div>
      </div>
    );
  }
  const pct = progress !== null ? Math.round(progress * 100) : null;
  if (state === 'downloading' || state === 'downloadable') {
    return (
      <div className="stack">
        <div><strong>{n} sheet{n === 1 ? '' : 's'} waiting.</strong> <span className="muted">{state === 'downloading' ? `Gemini Nano is downloading${pct !== null ? ` (${pct >= 90 ? 'unpacking' : `${pct}%`})` : ''}. Sheets are read on this laptop when it's ready.` : 'Gemini Nano is not downloaded yet.'}</span></div>
        {state === 'downloading' && pct !== null && <div className="progress" role="progressbar" aria-label="Download progress" aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>}
        <div className="row">
          {state === 'downloadable' && <button className="btn primary" onClick={() => downloadDeviceModel()}>Download Gemini Nano (about 5 min)</button>}
          {sample && <button className="btn" onClick={() => onStart()}>Read now with recorded readings</button>}
        </div>
      </div>
    );
  }
  if (sample) {
    return (
      <div className="row spread">
        <div><strong>{n} sheets waiting.</strong><div className="small muted">{DEVICE_STATE_TEXT[state as keyof typeof DEVICE_STATE_TEXT]?.title ?? 'Checking on-device AI'}. This made-up class uses cloud Gemini for 3 sheets and recorded readings for the rest.</div></div>
        <button className="btn primary" onClick={() => onStart()} disabled={state === 'checking'}>Read {label}</button>
      </div>
    );
  }
  return <p className="muted" style={{ margin: 0 }}>{n} photo{n === 1 ? '' : 's'} saved. Pupils' sheets are only ever read by on-device AI, which isn't available in this browser; type the answers in below instead.</p>;
}

function Tile({ s, cls, quiz, fresh, onRetry, canRetry }: { s: SheetRec; cls: ClassRec; quiz: QuizRec; fresh: boolean; onRetry: () => void; canRetry: boolean }) {
  const url = usePhoto(s);
  const student = cls.roster.find((r) => r.id === s.studentId);
  const done = s.status === 'read' || s.status === 'checked';
  const score = done ? scoreSheet(s.marks, quiz.unsimplifiedCredit) : null;
  const waiting = s.marks.filter(needsCheck).length;
  const body = (
    <>
      <div className="photo">
        {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%' }} className="small muted">{s.source === 'typed' ? 'Typed in' : ''}</div>}
        {score && <ScoreRing points={score.points} outOf={score.outOf} open={score.unreadable + score.pending > 0} />}
      </div>
      <span className="name clip">{student?.name ?? (s.readName ? `"${s.readName}"` : s.status === 'queued' ? 'Waiting' : s.status === 'reading' ? 'Reading…' : s.status === 'error' ? 'Not read yet' : 'Name not found')}</span>
      {done && <div className="strip" aria-label="Marks">{s.marks.map((m) => <AnswerMark key={m.q} m={m} />)}</div>}
      <span className="row" style={{ gap: 6 }}>
        {s.status === 'reading' && <span className="pill device"><i />Reading</span>}
        {done && <WhereChip where={s.source === 'typed' ? 'typed' : s.where} ms={s.ms} short />}
        {waiting > 0 && <span className="flag soft">{waiting} to decide</span>}
        {done && (!s.studentId || !s.nameConfident) && <span className="flag soft">Confirm name</span>}
      </span>
      {s.status === 'error' && <span className="small" style={{ color: 'var(--red)' }}>{s.error}</span>}
    </>
  );
  if (!done) return <div className={`tile ${s.status}`}>{body}{s.status === 'error' && canRetry && <button className="btn small" onClick={onRetry}>Try again</button>}</div>;
  return <a className={`tile ${s.status}${fresh ? ' fresh' : ''}`} href={href.check(quiz.id, s.id)}>{body}</a>;
}

export function usePhoto(s: SheetRec) {
  const [url, setUrl] = useState<string | null>(s.sampleId ? samplePhotoUrl(s.sampleId) : null);
  useEffect(() => {
    if (s.sampleId) { setUrl(samplePhotoUrl(s.sampleId)); return; }
    if (!s.imageId) { setUrl(null); return; }
    let alive = true, u: string | null = null;
    setUrl(null);
    store.image(s.imageId).then((b) => { if (b && alive) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [s.imageId, s.sampleId]);
  return url;
}

function DropPhotos({ quiz, existing, onAdded, compact = false }: { quiz: QuizRec; existing: SheetRec[]; onAdded: () => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const [adding, setAdding] = useState<{ done: number; total: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
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
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  return (
    <section className="section">
      <div className={`dropzone${over ? ' over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <p style={{ fontWeight: 700 }}>{compact ? 'Add more answer sheets' : 'Add the answer sheets: one photo per pupil'}</p>
        {!compact && <p className="muted small">Photograph each answer sheet flat, with all four black squares in view. JPEG, PNG or WebP. Each photo is resized and stripped of its location data on this device, then kept in this browser only. Phone photos: AirDrop, Nearby Share or a cable move them without a cloud album.</p>}
        <div className="row" style={{ justifyContent: 'center' }}>
          {touch && <button className="btn primary" onClick={() => camera.current?.click()} disabled={!!adding}><Icon name="camera" size={18} />Take a photo</button>}
          <button className={`btn${touch ? '' : ' primary'}`} onClick={() => input.current?.click()} disabled={!!adding}>{adding ? `Adding ${adding.done} of ${adding.total}…` : 'Choose photos'}</button>
        </div>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = ''; }} />
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
      const marks = markRead(quiz.keys, { answers: answers.map((a, i) => ({ q: quiz.keys[i].q, crossedOutText: '', finalAnswer: a })) }).map((m) => ({ ...m, checked: m.status !== 'unreadable' && m.status !== 'pending' }));
      await store.putSheet({ id: prev?.id ?? uid('sh'), quizId: quiz.id, source: 'typed', status: marks.every((m) => m.checked) ? 'checked' : 'read', studentId: st.id, nameConfident: true, readName: st.name, marks, where: 'local', createdAt: prev?.createdAt ?? Date.now() });
      n++;
    }
    setSaved(`Marked ${n} pupil${n === 1 ? '' : 's'}.`);
    onSaved();
  };
  return (
    <section className="panel section">
      <h2>Type the answers in</h2>
      <p className="muted">This browser can't read photos on the device, and pupils' sheets are never sent to the cloud. Type what each pupil wrote: code still marks every exact answer and names the mistake. Sentences and paragraphs wait for you to mark them in Check.</p>
      <div className="register-wrap">
        <table className="register">
          <thead><tr><th className="who" scope="col">Pupil</th>{quiz.keys.map((k) => <th key={k.q} scope="col" title={k.prompt}>Q{k.q}</th>)}</tr></thead>
          <tbody>
            {cls.roster.map((st) => (
              <tr key={st.id}>
                <th className="who" scope="row">{st.name}</th>
                {quiz.keys.map((k, i) => (
                  <td key={k.q} style={{ padding: '3px 4px' }}>
                    <input data-student aria-label={`${st.name}, question ${k.q}`} value={vals[st.id]?.[i] ?? ''} spellCheck={false} autoComplete="off" style={{ width: isOpen(typeOf(k)) ? '16em' : '6em', minHeight: 32, padding: '4px 6px' }}
                      onChange={(e) => setVals({ ...vals, [st.id]: (vals[st.id] ?? quiz.keys.map(() => '')).map((v, j) => (j === i ? e.target.value : v)) })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row mt">
        <button className="btn primary" onClick={save}>Mark typed answers</button>
        {saved && <span className="muted" role="status">{saved}</span>}
      </div>
    </section>
  );
}

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => undefined);
    return () => { lock?.release().catch(() => undefined); };
  }, [on]);
}
