// Records real cloud readings of the SYNTHETIC sample classes, cloud suggestions for their open
// answers, and one recorded lesson plan per class, into public/samples/<class>/recorded-cloud.json.
// Judges without on-device AI see these (labelled "Recorded cloud reading"), so the shared free quota
// is never exhausted. Same prompts and schemas as the app, through the same Firebase AI Logic
// endpoint, authenticated with an App Check debug token (exchanged via the App Check REST API).
// Resumable: a rerun keeps what is already recorded. Usage: npx -y tsx tools/record-cloud.ts [maths science english] [--totals-only]
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { FIREBASE_CONFIG } from '../src/config';
import { readSheetPrompt, suggestPassagePrompt, suggestShortPrompt, totalsPrompt } from '../src/ai/prompts';
import { coerceSheetRead, passageSuggestSchema, sheetSchema, shortSuggestSchema, TOTALS_SCHEMA_CLOUD } from '../src/ai/schemas';
import { buildTotals } from '../src/privacy/aggregate';
import { markAnswer, outOfFor, typeOf, type QuestionKey } from '../src/marking/mark';
import { decideOpen, toSuggestion } from '../src/marking/open';
import { markRead } from '../src/marking/pipeline';
import { keyPoints, parseRubric } from '../src/marking/qtypes';

const MODEL = 'gemini-3.5-flash-lite';
const debugToken = readFileSync('.env.development.local', 'utf8').match(/VITE_APPCHECK_DEBUG_TOKEN=(\S+)/)?.[1];
if (!debugToken) throw new Error('No debug token in .env.development.local');

async function appCheckToken(): Promise<string> {
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/apps/${FIREBASE_CONFIG.appId}:exchangeDebugToken?key=${FIREBASE_CONFIG.apiKey}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debugToken }) });
  if (!r.ok) throw new Error(`App Check exchange failed: ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

let ac = await appCheckToken();
let acAt = Date.now();
async function generate(parts: object[], schema: object, temperature: number) {
  if (Date.now() - acAt > 40 * 60 * 1000) { ac = await appCheckToken(); acAt = Date.now(); }
  const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${FIREBASE_CONFIG.projectId}/models/${MODEL}:generateContent`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': FIREBASE_CONFIG.apiKey, 'X-Firebase-AppCheck': ac },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature, responseMimeType: 'application/json', responseJsonSchema: schema } }),
    });
    if (r.status === 429 || r.status >= 500) { console.log(`  retry after ${r.status}`); await sleep(20000); continue; }
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json();
    await sleep(4300); // stay under 15 requests per minute
    return JSON.parse(j.candidates[0].content.parts.map((p: { text?: string }) => p.text ?? '').join(''));
  }
  throw new Error('too many retries');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || '').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/[.!]+$/, '').trim();

interface Manifest {
  quiz: { title: string; className: string; subject: 'maths' | 'science' | 'english'; grade_band: '4-6' | '7-9' | '10-12'; questions: { q: number; prompt: string; key: string; spellingCounts?: boolean }[] };
  students: { id: string; name: string; answers: { q: number; written: string; crossedOut: string; ref?: boolean[] | number[] }[] }[];
}

const classes = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const totalsOnly = process.argv.includes('--totals-only');
for (const cls of classes.length ? classes : ['maths', 'science', 'english']) {
  const m: Manifest = JSON.parse(readFileSync(`public/samples/${cls}/manifest.json`, 'utf8'));
  const keys: QuestionKey[] = m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key, ...(q.spellingCounts ? { spellingCounts: true } : {}) }));
  const file = `public/samples/${cls}/recorded-cloud.json`;
  const out = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { recordedAt: new Date().toISOString().slice(0, 10), model: MODEL, reads: {}, suggestions: {} };
  out.suggestions ??= {};
  const save = () => { writeFileSync(`${file}.tmp`, JSON.stringify(out, null, 1)); renameSync(`${file}.tmp`, file); };
  let exact = 0, total = 0, agree = 0, within = 0, sugg = 0;
  for (const s of totalsOnly ? [] : m.students) {
    if (!out.reads[s.id]) {
      const data = readFileSync(`public/samples/${cls}/${s.id}.jpg`).toString('base64');
      const t0 = Date.now();
      out.reads[s.id] = coerceSheetRead(await generate([{ text: readSheetPrompt(keys) }, { inlineData: { mimeType: 'image/jpeg', data } }], sheetSchema(keys.length), 0), keys.length);
      console.log(`${cls} ${s.id} read in ${Date.now() - t0} ms`);
      save();
    }
    const read = out.reads[s.id];
    const marks = markRead(keys, read);
    for (const a of s.answers) {
      const k = keys.find((x) => x.q === a.q)!;
      const t = typeOf(k);
      if (t !== 'short' && t !== 'passage') { total++; if (norm(read.answers.find((x: { q: number }) => x.q === a.q)?.finalAnswer ?? '') === norm(a.written)) exact++; continue; }
      const mk = marks.find((x) => x.q === a.q)!;
      if (mk.status !== 'pending') continue;
      const id = `${s.id}:${a.q}`;
      if (!out.suggestions[id]) {
        const rubric = parseRubric(k.answer) ?? [];
        const prompt = t === 'passage' ? suggestPassagePrompt(k.prompt, rubric, mk.read) : suggestShortPrompt(k.prompt, keyPoints(k.answer), mk.read);
        const schema = t === 'passage' ? passageSuggestSchema(rubric.map((r) => r.max)) : shortSuggestSchema(keyPoints(k.answer).length);
        out.suggestions[id] = await generate([{ text: prompt }], schema, 0);
        save();
      }
      const sg = toSuggestion(k, out.suggestions[id], 'recorded', 0);
      if (sg && a.ref) {
        const out2 = outOfFor(k);
        const ref = t === 'passage' ? Math.round(((a.ref as number[]).reduce((x, y) => x + y, 0) / ((parseRubric(k.answer) ?? []).reduce((x, l) => x + l.max, 0) || 1)) * out2 * 2) / 2
          : Math.round(((a.ref as boolean[]).filter(Boolean).length / (keyPoints(k.answer).length || 1)) * out2 * 2) / 2;
        sugg++; if (sg.points === ref) agree++; if (Math.abs(sg.points - ref) <= 1) within++;
      }
    }
  }
  // The recorded plan uses the class's TRUE answers, marked by code, with the open answers decided by the author's reference marks.
  if (!out.totals || totalsOnly) {
    const sheets = m.students.map((s) => ({
      marks: s.answers.map((a) => {
        const k = keys.find((x) => x.q === a.q)!;
        const mk = markAnswer(k, a.written);
        if (mk.status !== 'pending' || !a.ref) return mk;
        return typeOf(k) === 'passage'
          ? decideOpen(k, mk, { lines: (a.ref as number[]).map((score, i) => ({ score, max: (parseRubric(k.answer) ?? [])[i]?.max ?? score })) })
          : decideOpen(k, mk, { met: a.ref as boolean[] });
      }),
    }));
    const payload = buildTotals(keys, sheets, 3, ['en', 'hi', 'ta'], { subject: m.quiz.subject, grade_band: m.quiz.grade_band });
    out.totals = await generate([{ text: totalsPrompt(payload) }], TOTALS_SCHEMA_CLOUD, 0.6);
    out.totalsPayload = payload;
    out.totalsRecordedAt = new Date().toISOString().slice(0, 10);
    save();
  }
  if (!totalsOnly) out.cloudAccuracy = { exactReads: exact, exactTotal: total, suggestions: sugg, agree, within1: within };
  save();
  console.log(`${cls}: cloud exact reads ${exact}/${total}; suggestions equal to reference ${agree}/${sugg} (within one mark ${within}); wrote ${file}`);
}
