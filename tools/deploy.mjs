// Build (with the dist secret check), deploy to Firebase Hosting, then smoke-test the live site.
// Usage: node tools/deploy.mjs
import { execSync } from 'node:child_process';

const SITE = 'https://buildhybridai-lohe.web.app';
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm run build');
run('npx -y firebase-tools@latest deploy --only hosting --project buildhybridai-lohe --non-interactive');

const checks = [
  ['/', (r, t) => r.status === 200 && t.includes('<title>Tickmark</title>')],
  ['/samples/manifest.json', (r, t) => r.status === 200 && JSON.parse(t).students.length === 28],
  ['/samples/s01.jpg', (r) => r.status === 200 && r.headers.get('content-type') === 'image/jpeg'],
];
let ok = true;
for (const [path, test] of checks) {
  const r = await fetch(SITE + path, { cache: 'no-store' });
  const t = path.endsWith('.jpg') ? '' : await r.text();
  const pass = test(r, t);
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'} ${path} (${r.status})`);
}
const h = await fetch(SITE + '/', { cache: 'no-store' });
for (const k of ['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'referrer-policy']) console.log(`  ${k}: ${h.headers.get(k) ? 'set' : 'missing'}`);
process.exit(ok ? 0 : 1);
