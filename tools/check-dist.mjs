// Fails the build if a secret, the App Check debug token, analytics, the dev-only Nano recorder or
// the old bench images reached dist/. Paths are resolved from this file, so it works from any folder.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = process.argv[2] ?? join(APP, 'dist');
const fail = (why) => { console.error(`check-dist: ${why}`); process.exit(1); };

const secrets = [];
for (const f of ['.env.development.local', '.env.local', 'appcheck-debug-token.txt']) {
  const p = join(APP, f);
  if (!existsSync(p)) continue;
  const t = readFileSync(p, 'utf8').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (t) secrets.push(t[0]);
}
const bad = [/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*["'][0-9a-f-]{36}/i, /googletagmanager\.com/, /google-analytics\.com/, /measurementId/, /__tickmarkCapture/];
const BINARY = /\.(jpe?g|png|gif|webp|avif|ico|woff2?|ttf|otf|pdf|mp4|webm)$/i;

if (!existsSync(DIST)) fail(`${DIST} does not exist`);
if (existsSync(join(DIST, 'bench'))) fail('dist/bench exists: bench images are not part of the app');
let n = 0;
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (BINARY.test(f)) return;
  const s = readFileSync(p, 'utf8'); n++;
  for (const sec of secrets) if (s.includes(sec)) fail(`debug token found in ${p}`);
  for (const re of bad) if (re.test(s)) fail(`forbidden pattern ${re} in ${p}`);
});
walk(DIST);
console.log(`check-dist: ${n} text files clean (no debug token, no analytics, no recorder, no bench)`);
