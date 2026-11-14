// Live regression for the judge path WITHOUT on-device AI (setup C), in a fresh headless Edge
// profile (no LanguageModel API). Checks what really goes over the wire.
// Usage: node tools/live-regression.mjs [site-url]
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

const SITE = process.argv[2] ?? 'https://buildhybridai-lohe.web.app';
const manifest = JSON.parse(readFileSync('public/samples/manifest.json', 'utf8'));
const roster = manifest.students.flatMap((s) => s.name.toLowerCase().split(' '));
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

await page.goto(`${SITE}/#/quiz/sample-quiz`);
const hasLM = await page.evaluate(() => 'LanguageModel' in self);
check('fresh Edge profile has no on-device model API (setup C)', !hasLM);
await page.getByText('Sample: cloud mode').first().waitFor({ timeout: 15000 });
check('top bar says "Sample: cloud mode"', true);

await page.getByRole('button', { name: /^Read all/ }).click();
await page.getByText(/All 28 sheets read/).waitFor({ timeout: 240000 });
check('all 28 sample sheets read without on-device AI', true);
const chips = await page.locator('.tile .pill').allTextContents();
const cloud = chips.filter((c) => /^Cloud/.test(c)).length, recorded = chips.filter((c) => /Recorded/.test(c)).length;
check('at most 3 live cloud reads, the rest recorded', cloud <= 3 && cloud + recorded === 28, `${cloud} cloud, ${recorded} recorded`);

await page.goto(`${SITE}/#/quiz/sample-quiz/reteach`);
await page.getByRole('button', { name: /Send class totals/ }).click();
await page.locator('h2[tabindex="-1"]').waitFor({ timeout: 60000 });
const planChip = await page.locator('section.sheet .pill').first().textContent();
check('lesson plan written (cloud, or labelled recording)', /Cloud|Recorded/.test(planChip ?? ''), planChip ?? '');

// What went over the wire
const imgs = aiBodies.flatMap((b) => [...b.matchAll(/"data":"([A-Za-z0-9+/=]{100,})"/g)].map((m) => m[1]));
const { createHash } = await import('node:crypto');
const allowed = new Set(manifest.students.map((s) => s.sha256));
const nonSample = imgs.filter((d) => !allowed.has(createHash('sha256').update(Buffer.from(d, 'base64')).digest('hex'))).length;
check('every image sent is a fingerprinted sample sheet', nonSample === 0, `${imgs.length} images`);
const totalsBodies = aiBodies.filter((b) => !b.includes('inlineData'));
const leaked = roster.filter((w) => w.length > 2 && totalsBodies.some((b) => new RegExp(`\\b${w}\\b`, 'i').test(b.replace(/\\n/g, ' '))));
check('no roster name in any non-image request', leaked.length === 0, leaked.join(','));
check('AI requests made', aiBodies.length >= 1 && aiBodies.length <= 4, `${aiBodies.length}`);
check('no CSP violations', cspErrors.length === 0, cspErrors[0] ?? '');

await page.goto(`${SITE}/#/privacy`);
const photos = await page.locator('.stat').filter({ hasText: 'student photos sent' }).locator('b').textContent();
check('Privacy page: 0 student photos sent', photos?.trim() === '0');
} finally { await browser.close(); }
const ok = results.every(Boolean);
console.log(ok ? `ALL PASS (${results.length})` : 'SOME CHECKS FAILED');
process.exit(ok ? 0 : 1);
