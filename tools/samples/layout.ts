// Writes tools/samples/out/<class>/layout.json: the answer-sheet boxes (mm) the app computes from the key.
import { readFileSync, writeFileSync } from 'node:fs';
import { layout, markerCentres, MARKER } from '../../src/img/sheet';
for (const c of ['maths', 'science', 'english']) {
  const m = JSON.parse(readFileSync(`public/samples/${c}/manifest.json`, 'utf8'));
  const keys = m.quiz.questions.map((q: { q: number; prompt: string; key: string }) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
  writeFileSync(`tools/samples/out/${c}/layout.json`, JSON.stringify({ boxes: layout(keys), markers: markerCentres(), markerSize: MARKER.size }));
  console.log(c, layout(keys).length, 'boxes');
}
