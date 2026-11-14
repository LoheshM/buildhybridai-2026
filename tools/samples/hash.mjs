// Writes the SHA-256 of every public/samples/*.jpg into public/samples/manifest.json.
// The app only lets an image reach the cloud if its exact bytes match one of these hashes.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, '..', '..', 'public', 'samples');
copyFileSync(join(here, 'out', 'manifest.json'), join(pub, 'manifest.json'));
const m = JSON.parse(readFileSync(join(pub, 'manifest.json'), 'utf8'));
for (const s of m.students) s.sha256 = createHash('sha256').update(readFileSync(join(pub, `${s.id}.jpg`))).digest('hex');
writeFileSync(join(pub, 'manifest.json'), JSON.stringify(m, null, 1));
console.log('hashed', m.students.length, 'sheets');
