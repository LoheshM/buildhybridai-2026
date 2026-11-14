// Renders every student in out/manifest.json to out/raw/<id>.png with headless Chrome,
// then tools/samples/photo.py turns them into phone-photo-like JPEGs in public/samples/.
// Usage: node tools/samples/render.mjs [--only s01,s02]
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const m = JSON.parse(readFileSync(join(here, 'out', 'manifest.json'), 'utf8'));
const blank = process.argv.includes('--blank'); // blank answers: real handwriting is pasted in later (mnist.py)
const rawDir = join(here, 'out', blank ? 'raw-blank' : 'raw');
mkdirSync(rawDir, { recursive: true });
const CHROME = process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONTS = ['Kalam', 'Caveat', 'Patrick Hand', 'Gochi Hand', 'Indie Flower', 'Shadows Into Light', 'Reenie Beanie'];
const SIZES = { Kalam: 46, Caveat: 58, 'Patrick Hand': 50, 'Gochi Hand': 50, 'Indie Flower': 48, 'Shadows Into Light': 52, 'Reenie Beanie': 62 };
const INKS = ['#1b2f8a', '#1d1d1d', '#24408f', '#3b3b3b', '#0f3d7a'];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const sheetUrl = pathToFileURL(join(here, 'sheet.html')).href;

m.students.forEach((s, i) => {
  if (only && !only.includes(s.id)) return;
  const font = FONTS[i % FONTS.length];
  const data = {
    seed: 1000 + i * 77, title: m.quiz.title, className: m.quiz.className, name: s.name.split(' ')[0] + ' ' + s.name.split(' ')[1][0] + '.',
    font, size: SIZES[font], ink: INKS[i % INKS.length], stacked: i % 5 === 3,
    questions: m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt })),
    answers: blank ? s.answers.map((a) => ({ ...a, written: '', crossedOut: '' })) : s.answers,
  };
  const hash = Buffer.from(JSON.stringify(data), 'utf8').toString('base64');
  const out = join(rawDir, `${s.id}.png`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', `--screenshot=${out}`, '--window-size=1240,1754', '--virtual-time-budget=10000', `${sheetUrl}#${hash}`], { stdio: 'ignore' });
  if (!existsSync(out)) throw new Error('render failed for ' + s.id);
  console.log('rendered', s.id, font, data.stacked ? 'stacked' : '');
});
