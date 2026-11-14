// Fails the build if a secret or the App Check debug token reached dist/.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const secrets = [];
for (const f of ['.env.development.local', 'appcheck-debug-token.txt']) {
  if (!existsSync(f)) continue;
  const t = readFileSync(f, 'utf8').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (t) secrets.push(t[0]);
}
const bad = [/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*["'][0-9a-f-]{36}/i, /googletagmanager\.com/, /google-analytics\.com/, /measurementId/];
let n = 0;
const walk = (d) => readdirSync(d).forEach((f) => {
  const p = join(d, f);
  if (statSync(p).isDirectory()) return walk(p);
  if (!/\.(js|html|css|json|map)$/.test(f)) return;
  const s = readFileSync(p, 'utf8'); n++;
  for (const sec of secrets) if (s.includes(sec)) { console.error(`check-dist: debug token found in ${p}`); process.exit(1); }
  for (const re of bad) if (re.test(s)) { console.error(`check-dist: forbidden pattern ${re} in ${p}`); process.exit(1); }
});
walk('dist');
console.log(`check-dist: ${n} files clean (no debug token, no analytics)`);
