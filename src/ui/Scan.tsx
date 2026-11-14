import { useEffect, useMemo, useRef, useState } from 'react';
import { normalizeUpload } from '../ai/images';
import { setRosterTokens } from '../ai/netGuard';
import { href } from '../app/router';
import { onRun, runQuiz, runState, stopRun, type RunState } from '../app/runner';
import { scoreSheet } from '../marking/mark';
import { markRead, needsCheck } from '../marking/pipeline';
import { rosterTokens } from '../privacy/nameCheck';
import { store, uid, type ClassRec, type QuizRec, type SheetRec } from '../store/db';
import { useDevice, useLoad } from './hooks';
import { ScoreRing, WhereChip } from './Marks';

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
  useEffect(() => onRun(setRun), []);
  useEffect(() => { if (ctx?.cls) setRosterTokens(rosterTokens(ctx.cls.roster.map((s) => s.name))); }, [ctx?.cls]);

  if (!ctx) return <p className="muted">Loading…</p>;
  if (!ctx.quiz || !ctx.cls) return <p>This quiz no longer exists. <a href={href.home()}>Back to classes</a></p>;
  const { quiz, cls } = ctx;
  const onSheet = (s: SheetRec) => setSheets((xs) => xs.map((x) => (x.id === s.id ? s : x)));
  const pending = sheets.filter((s) => s.status === 'queued' || s.status === 'error');
  const toCheck = sheets.reduce((n, s) => n + s.marks.filter(needsCheck).length, 0);
  const readCount = sheets.filter((s) => s.status === 'read' || s.status === 'checked').length;
  const deviceReady = d.state === 'available';
  const canReadPhotos = cls.sample || deviceReady;
  const remainingSecs = Math.round(((run.total - run.done) * (run.avgMs || 9000)) / 1000);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <span className="muted small">{cls.name}</span>
          <h1 style={{ margin: 0 }}>{quiz.title}</h1>
        </div>
        <div className="row">
          <a className="btn" href={href.check(quiz.id)}>{toCheck ? `Check ${toCheck} flagged answer${toCheck === 1 ? '' : 's'}` : 'Check answers'}</a>
          <a className="btn primary" href={href.results(quiz.id)}>Results</a>
        </div>
      </div>

      {cls.sample && (
        <p className="callout" style={{ marginTop: 16 }}>
          These 28 worksheets are made up: invented names, handwriting drawn with open-licence handwriting fonts, and mistakes
          planted on purpose. {deviceReady ? 'They are read on this laptop, like a real class.' : 'Without on-device AI here, the first 3 are read live by cloud Gemini (allowed only because they are made-up sheets) and the rest use recorded cloud readings.'}
        </p>
      )}

      <section className="sheet section" style={{ marginTop: 16 }}>
        {run.running ? (
          <div className="stack" role="status" aria-live="polite">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <strong>Reading sheet {Math.min(run.done + 1, run.total)} of {run.total}{deviceReady ? ' on this laptop' : ''}…</strong>
              <span className="muted small">about {remainingSecs >= 60 ? `${Math.round(remainingSecs / 60)} min` : `${remainingSecs} s`} left</span>
              <button className="btn small" onClick={stopRun}>Stop</button>
            </div>
            <div className="progress"><i style={{ width: `${(run.done / Math.max(1, run.total)) * 100}%` }} /></div>
          </div>
        ) : pending.length > 0 ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <strong>{pending.length} sheet{pending.length === 1 ? '' : 's'} waiting to be read.</strong>
              <div className="muted small">{deviceReady ? `About ${Math.max(1, Math.round((pending.length * 12) / 60))} min on this laptop. Nothing is uploaded.` : cls.sample ? 'This laptop has no on-device AI, so the sample uses the cloud path described above.' : 'Student sheets are read only by on-device AI, which this laptop does not have.'}</div>
            </div>
            {canReadPhotos && (
              <div className="row">
                {cls.sample && pending.length > 8 && <button className="btn" onClick={() => runQuiz(cls, quiz, onSheet, 8)}>Quick look: read 8</button>}
                <button className="btn primary" onClick={() => runQuiz(cls, quiz, onSheet)}>Read {pending.length === sheets.length ? 'all' : 'the rest'}</button>
              </div>
            )}
          </div>
        ) : sheets.length ? (
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>All {readCount} sheets read.</strong>
            <span className="muted">{toCheck ? `${toCheck} answers are waiting for you.` : 'Nothing left to check.'}</span>
          </div>
        ) : null}
        {run.error && <p className="callout bad" role="alert" style={{ marginTop: 12 }}>{run.error}</p>}
      </section>

      {!cls.sample && (deviceReady ? <DropPhotos quiz={quiz} onAdded={reload} /> : <TypedGrid cls={cls} quiz={quiz} existing={sheets} onSaved={reload} />)}

      {sheets.length > 0 && (
        <section className="section">
          <h2>Sheets</h2>
          <div className="tiles">
            {sheets.map((s) => <Tile key={s.id} s={s} cls={cls} quiz={quiz} />)}
          </div>
        </section>
      )}
    </>
  );
}

function Tile({ s, cls, quiz }: { s: SheetRec; cls: ClassRec; quiz: QuizRec }) {
  const [url, setUrl] = useState<string | null>(s.sampleId ? `/samples/${s.sampleId}.jpg` : null);
  useEffect(() => {
    if (s.sampleId || !s.imageId) return;
    let u: string | null = null;
    store.image(s.imageId).then((b) => { if (b) { u = URL.createObjectURL(b); setUrl(u); } });
    return () => { if (u) URL.revokeObjectURL(u); };
  }, [s.imageId, s.sampleId]);
  const student = cls.roster.find((r) => r.id === s.studentId);
  const done = s.status === 'read' || s.status === 'checked';
  const score = done ? scoreSheet(s.marks, quiz.unsimplifiedCredit) : null;
  const flags = s.marks.filter(needsCheck).length;
  return (
    <a className={`tile ${s.status}`} href={href.check(quiz.id, s.id)}>
      <div className="mark-sheet">
        {url ? <img src={url} alt="" loading="lazy" /> : <div style={{ aspectRatio: '1100/1492', display: 'grid', placeItems: 'center' }} className="muted small">Typed in</div>}
        {score && score.unreadable === 0 && <ScoreRing points={score.points} outOf={score.outOf} />}
      </div>
      <span className="name">{student?.name ?? (s.readName ? `"${s.readName}"` : s.status === 'queued' ? 'Waiting' : s.status === 'reading' ? 'Reading…' : s.status === 'error' ? 'Not read yet' : 'Name not found')}</span>
      <span className="meta">
        {s.status === 'reading' && <span className="pill device">Reading…</span>}
        {s.status === 'error' && <span className="pill bad" title={s.error}>Not read</span>}
        {done && <WhereChip where={s.where} ms={s.ms} />}
        {flags > 0 && <span className="flag">{flags} to check</span>}
        {done && !s.studentId && <span className="flag">Pick name</span>}
      </span>
    </a>
  );
}

function DropPhotos({ quiz, onAdded }: { quiz: QuizRec; onAdded: () => void }) {
  const [over, setOver] = useState(false);
  const [msg, setMsg] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const add = async (files: FileList | File[]) => {
    const errs: string[] = [];
    let n = 0;
    for (const f of Array.from(files)) {
      try {
        const blob = await normalizeUpload(f);
        const imageId = uid('img');
        await store.putImage(imageId, blob);
        await store.putSheet({ id: uid('sh'), quizId: quiz.id, imageId, source: 'photo', fileName: f.name, status: 'queued', studentId: null, nameConfident: false, readName: '', marks: [], createdAt: Date.now() + n });
        n++;
      } catch (e) { errs.push((e as Error).message); }
    }
    setMsg([`Added ${n} photo${n === 1 ? '' : 's'}.`, ...errs]);
    onAdded();
  };
  return (
    <section className="section">
      <div className={`dropzone ${over ? 'over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer.files); }}>
        <p style={{ margin: '0 auto 10px', fontWeight: 700 }}>Drop worksheet photos here, one photo per student.</p>
        <p className="muted small" style={{ margin: '0 auto 12px' }}>JPEG or PNG. Photos are resized and their location data removed on this laptop, then stored in this browser only. Tip: AirDrop, Nearby Share or a USB cable moves phone photos to the laptop without a cloud album.</p>
        <button className="btn" onClick={() => input.current?.click()}>Choose photos</button>
        <input ref={input} type="file" accept="image/jpeg,image/png" multiple hidden onChange={(e) => e.target.files && add(e.target.files)} />
      </div>
      {msg.length > 0 && <ul className="small">{msg.map((m, i) => <li key={i}>{m}</li>)}</ul>}
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
  const [saved, setSaved] = useState(false);
  const save = async () => {
    for (const st of cls.roster) {
      const answers = vals[st.id];
      if (!answers.some((a) => a.trim())) continue;
      const prev = existing.find((s) => s.studentId === st.id && s.source === 'typed');
      const marks = markRead(quiz.keys, { answers: answers.map((a, i) => ({ q: quiz.keys[i].q, crossedOutText: '', finalAnswer: a })) }).map((m) => ({ ...m, checked: true }));
      await store.putSheet({ id: prev?.id ?? uid('sh'), quizId: quiz.id, source: 'typed', status: 'checked', studentId: st.id, nameConfident: true, readName: st.name, marks, where: 'local', createdAt: prev?.createdAt ?? Date.now() });
    }
    setSaved(true);
    onSaved();
  };
  return (
    <section className="sheet section">
      <h2>Type the answers in</h2>
      <p className="muted">This laptop can't run Gemini Nano, and student sheets are never sent to the cloud. Type what each student wrote; Tickmark still marks every answer and names each mistake, right here.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="plain">
          <thead><tr><th>Student</th>{quiz.keys.map((k) => <th key={k.q} title={k.prompt}>Q{k.q}</th>)}</tr></thead>
          <tbody>
            {cls.roster.map((st) => (
              <tr key={st.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{st.name}</td>
                {quiz.keys.map((k, i) => (
                  <td key={k.q}>
                    <input data-student aria-label={`${st.name}, question ${k.q}`} value={vals[st.id][i]} spellCheck={false} autoComplete="off" style={{ width: '5.5em', minHeight: 32 }}
                      onChange={(e) => setVals({ ...vals, [st.id]: vals[st.id].map((v, j) => (j === i ? e.target.value : v)) })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={save}>Mark typed answers</button>
        {saved && <span className="muted">Marked. See Results.</span>}
      </div>
    </section>
  );
}
