// Build (with the dist secret check), deploy to Firebase Hosting, then smoke-test the live site.
// Usage: node tools/deploy.mjs [--channel <name>]   (a channel deploys a preview URL instead of live)
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const FIREBASE_TOOLS = 'firebase-tools@15.32.1';
const args = process.argv.slice(2);
const channel = args.includes('--channel') ? args[args.indexOf('--channel') + 1] : null;
if (args.includes('--channel') && (!channel || channel.startsWith('-'))) { console.error('Usage: node tools/deploy.mjs --channel <name>'); process.exit(2); }
const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

run('npm run build');
let site = 'https://buildhybridai-lohe.web.app';
if (channel) {
  const out = execSync(`npx -y ${FIREBASE_TOOLS} hosting:channel:deploy ${channel} --project buildhybridai-lohe --expires 7d --json`).toString();
  site = Object.values(JSON.parse(out.slice(out.indexOf('{'))).result)[0].url;
} else {
  run(`npx -y ${FIREBASE_TOOLS} deploy --only hosting --project buildhybridai-lohe --non-interactive`);
}

let ok = true;
const check = (name, pass, extra = '') => { ok &&= pass; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };
try {
  const idx = await fetch(site + '/', { cache: 'no-store' });
  const html = await idx.text();
  check('index.html', idx.status === 200 && html.includes('<title>Tickmark</title>'));
  check('index.html is no-cache', /no-cache/.test(idx.headers.get('cache-control') ?? ''), idx.headers.get('cache-control'));
  check('CSP enforced', !!idx.headers.get('content-security-policy'));
  const js = html.match(/\/assets\/[^"]+\.js/)?.[0];
  const jr = js ? await fetch(site + js) : null;
  check('JS served as JavaScript', !!jr && /javascript/.test(jr.headers.get('content-type') ?? ''));
  const m = await (await fetch(site + '/samples/manifest.json', { cache: 'no-store' })).json();
  check('manifest has 28 sheets', m.students.length === 28);
  let hashes = 0;
  for (const s of m.students) {
    const buf = Buffer.from(await (await fetch(`${site}/samples/${s.id}.jpg`)).arrayBuffer());
    if (createHash('sha256').update(buf).digest('hex') === s.sha256) hashes++;
  }
  check('every sample photo matches its fingerprint', hashes === 28, `${hashes}/28`);
  const rec = await (await fetch(site + '/samples/recorded-cloud.json', { cache: 'no-store' })).json();
  check('recorded cloud readings complete', Object.keys(rec.reads).length === 28 && !!rec.totals);
  const missing = await fetch(site + '/no-such-file.js');
  check('missing files are 404, not the app', missing.status === 404);
} catch (e) {
  check('smoke test ran', false, e.message);
}
console.log(`site: ${site}`);
process.exit(ok ? 0 : 1);
