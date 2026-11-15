// Live regression for the judge path WITHOUT on-device AI, in a fresh headless Edge profile (no
// LanguageModel API). Reads all three made-up sample classes, plans a lesson for each, and checks
// what really goes over the wire.
// Usage: node tools/live-regression.mjs [site-url]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SITE = process.argv[2] ?? 'https://buildhybridai-lohe.web.app';
const CLASSES = [['maths', 28], ['science', 24], ['english', 18]];
const manifests = Object.fromEntries(CLASSES.map(([c]) => [c, JSON.parse(readFileSync(`public/samples/${c}/manifest.json`, 'utf8'))]));
const roster = [...new Set(Object.values(manifests).flatMap((m) => m.students.flatMap((s) => s.name.toLowerCase().split(/\s+/))))].filter((w) => w.length > 2);
const allowed = new Set(Object.values(manifests).flatMap((m) => m.students.map((s) => s.sha256)));
const results = [];
const check = (name, pass, extra = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); };

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await ctx.newPage();
  const aiBodies = [];
  const cspErrors = [];
  page.on('request', (r) => { if (r.url().includes('firebasevertexai.googleapis.com')) aiBodies.push(r.postData() ?? ''); });
  page.on('console', (m) => { if (/Content Security Policy|Refused to/.test(m.text())) cspErrors.push(m.text()); });
  page.on('dialog', (d) => d.accept());

  await page.goto(`${SITE}/#/`);
  check('fresh Edge profile has no on-device model API', !(await page.evaluate(() => 'LanguageModel' in self)));
  await page.getByText('No on-device AI').first().waitFor({ timeout: 20000 });
  check('top bar says "No on-device AI"', true);

  for (const [cls, n] of CLASSES) {
    await page.goto('about:blank');
    await page.goto(`${SITE}/#/quiz/sample-quiz-${cls}`);
    await page.getByRole('button', { name: /^Read all/ }).click();
    await page.getByText(new RegExp(`All ${n} sheets read`)).waitFor({ timeout: 300000 });
    const chips = await page.locator('.tile .pill').allTextContents();
    const cloud = chips.filter((c) => /^Cloud/.test(c)).length, recorded = chips.filter((c) => /Recorded/.test(c)).length;
    check(`${cls}: all ${n} sheets read without on-device AI; at most 3 live cloud reads`, cloud <= 3 && cloud + recorded === n, `${cloud} cloud, ${recorded} recorded`);
    const errors = await page.locator('.tile.error').count();
    check(`${cls}: no sheet failed (corner squares found on every photo)`, errors === 0, `${errors} errors`);
    await page.goto('about:blank');
    await page.goto(`${SITE}/#/quiz/sample-quiz-${cls}/reteach`);
    await page.getByRole('button', { name: /Send the class totals/ }).click();
    await page.locator('#plan-h').waitFor({ timeout: 90000 });
    const chip = await page.locator('section.panel .pill').filter({ hasText: /Cloud|Recorded|laptop/ }).first().textContent();
    check(`${cls}: lesson plan written (cloud, or labelled recording)`, /Cloud|Recorded/.test(chip ?? ''), chip ?? '');
  }

  await page.goto('about:blank');
  await page.goto(`${SITE}/#/privacy`);
  await page.getByRole('button', { name: /Try to send them/ }).click();
  await page.getByText(/Refused:/).first().waitFor({ timeout: 20000 });
  const refused = await page.getByText(/Refused:/).count(), notRefused = await page.getByText(/Not refused:/).count();
  check('guard self-test: both attempts refused before leaving the browser', refused === 2 && notRefused === 0, `${refused} refused`);

  // What went over the wire
  const imgs = aiBodies.flatMap((b) => [...b.matchAll(/"data":"([A-Za-z0-9+/=]{100,})"/g)].map((m) => m[1]));
  const nonSample = imgs.filter((d) => !allowed.has(createHash('sha256').update(Buffer.from(d, 'base64')).digest('hex'))).length;
  check('every image sent is a fingerprinted sample answer sheet', nonSample === 0, `${imgs.length} images`);
  const totalsBodies = aiBodies.filter((b) => !b.includes('inlineData'));
  const leaked = roster.filter((w) => totalsBodies.some((b) => new RegExp(`\\b${w}\\b`, 'i').test(b.replace(/\\n/g, ' '))));
  check('no class-list name in any non-image request', leaked.length === 0, leaked.join(','));
  check('AI requests made, few of them', aiBodies.length >= 1 && aiBodies.length <= 12, `${aiBodies.length}`);
  check('no CSP violations', cspErrors.length === 0, cspErrors[0] ?? '');
  const photos = await page.locator('.facts li').filter({ hasText: 'pupil photos sent' }).locator('b').textContent();
  check('Privacy page: 0 pupil photos sent', photos?.trim() === '0');
} finally { await browser.close(); }
const ok = results.every(Boolean);
console.log(ok ? `ALL PASS (${results.length})` : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
