// Records real cloud readings of the 28 SYNTHETIC sample sheets, plus one recorded lesson plan,
// into public/samples/recorded-cloud.json. Judges without on-device AI see these (labelled
// "Recorded cloud reading") so the shared free quota is never exhausted.
// Uses the same prompts and schemas as the app, through the same Firebase AI Logic endpoint,
// authenticated with an App Check debug token (exchanged via the App Check REST API).
// Usage: npx -y tsx tools/record-cloud.ts            (needs .env.development.local)
import { readFileSync, writeFileSync } from 'node:fs';
import { FIREBASE_CONFIG } from '../src/config';
import { readSheetPrompt, totalsPrompt } from '../src/ai/prompts';
import { SHEET_SCHEMA, TOTALS_SCHEMA_CLOUD } from '../src/ai/schemas';
import { buildTotals } from '../src/privacy/aggregate';
import { markAnswer } from '../src/marking/mark';

const MODEL = 'gemini-3.5-flash-lite';
const debugToken = readFileSync('.env.development.local', 'utf8').match(/VITE_APPCHECK_DEBUG_TOKEN=(\S+)/)?.[1];
if (!debugToken) throw new Error('No debug token in .env.development.local');

async function appCheckToken(): Promise<string> {
  const url = `https://firebaseappcheck.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/apps/${FIREBASE_CONFIG.appId}:exchangeDebugToken?key=${FIREBASE_CONFIG.apiKey}`;
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ debugToken }) });
  if (!r.ok) throw new Error(`App Check exchange failed: ${r.status} ${await r.text()}`);
  return (await r.json()).token;
}

async function generate(parts: object[], schema: object, temperature: number, ac: string) {
  const url = `https://firebasevertexai.googleapis.com/v1beta/projects/${FIREBASE_CONFIG.projectId}/models/${MODEL}:generateContent`;
  for (let attempt = 0; attempt < 4; attempt++) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': FIREBASE_CONFIG.apiKey, 'X-Firebase-AppCheck': ac },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { temperature, responseMimeType: 'application/json', responseJsonSchema: schema } }),
    });
    if (r.status === 429 || r.status >= 500) { console.log(`  retry after ${r.status}`); await sleep(20000); continue; }
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json();
    return JSON.parse(j.candidates[0].content.parts.map((p: { text?: string }) => p.text ?? '').join(''));
  }
  throw new Error('too many retries');
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => (s || '').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim();

const m = JSON.parse(readFileSync('public/samples/manifest.json', 'utf8'));
const ac = await appCheckToken();
const out: Record<string, unknown> = { recordedAt: new Date().toISOString().slice(0, 10), model: MODEL, reads: {} as Record<string, unknown> };
let exact = 0, total = 0;
for (const s of m.students) {
  const data = readFileSync(`public/samples/${s.id}.jpg`).toString('base64');
  const t0 = Date.now();
  const read = await generate([{ text: readSheetPrompt(10) }, { inlineData: { mimeType: 'image/jpeg', data } }], SHEET_SCHEMA, 0, ac);
  (out.reads as Record<string, unknown>)[s.id] = read;
  const byQ = new Map(read.answers.map((a: { q: number; finalAnswer: string }) => [a.q, a.finalAnswer]));
  const ok = s.answers.filter((a: { q: number; written: string }) => norm(String(byQ.get(a.q) ?? '')) === norm(a.written)).length;
  exact += ok; total += 10;
  console.log(`${s.id} ${ok}/10 ${Date.now() - t0} ms`);
  await sleep(4500); // stay under 15 requests per minute
}
const keys = m.quiz.questions.map((q: { q: number; prompt: string; key: string }) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
const sheets = m.students.map((s: { answers: { q: number; written: string }[] }) => ({ marks: s.answers.map((a) => markAnswer(keys[a.q - 1], a.written)) }));
out.totals = await generate([{ text: totalsPrompt(buildTotals(keys, sheets, 3, ['en', 'hi', 'ta'])) }], TOTALS_SCHEMA_CLOUD, 0.6, ac);
out.cloudAccuracy = { exact, total };
writeFileSync('public/samples/recorded-cloud.json', JSON.stringify(out, null, 1));
console.log(`cloud exact reads: ${exact}/${total}; wrote public/samples/recorded-cloud.json`);
