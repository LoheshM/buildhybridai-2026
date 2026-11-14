// Paste into DevTools on a Tickmark page (or run via automation) after reading the sample class.
// Compares stored readings with the generator's ground truth and prints the §2.5 metrics:
// exact reads, misreads, UNFLAGGED misreads (the one that matters), flag rate, seconds per sheet.
(async () => {
  const m = await (await fetch('/samples/manifest.json')).json();
  const truth = Object.fromEntries(m.students.map((s) => [s.id, s.answers]));
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tickmark'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const sheets = await new Promise((res) => { const tx = db.transaction('sheets'); const q = tx.objectStore('sheets').getAll(); q.onsuccess = () => res(q.result); });
  const norm = (s) => (s || '').replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').trim();
  const rows = sheets.filter((s) => s.quizId === 'sample-quiz' && (s.status === 'read' || s.status === 'checked'));
  let answers = 0, exact = 0, misread = 0, unflagged = 0, flagged = 0, ms = 0, names = 0;
  const misses = [];
  for (const s of rows) {
    const t = truth[s.sampleId];
    if (s.studentId === s.sampleId) names++;
    ms += (s.ms || 0) + (s.rereadMs || 0);
    for (const mk of s.marks) {
      const want = t.find((a) => a.q === mk.q).written;
      answers++;
      const hasFlag = mk.flags.filter((f) => f !== 'teacher_changed').length > 0;
      if (hasFlag) flagged++;
      if (norm(mk.read) === norm(want)) exact++;
      else { misread++; if (!hasFlag) { unflagged++; misses.push(`${s.sampleId} q${mk.q}: "${mk.read}" (truth "${want}") ${mk.status}`); } }
    }
  }
  const out = { sheets: rows.length, answers, exactPct: +(100 * exact / answers).toFixed(1), misread, unflagged, unflaggedPct: +(100 * unflagged / answers).toFixed(2), flagRatePct: +(100 * flagged / answers).toFixed(1), secsPerSheet: +(ms / 1000 / rows.length).toFixed(1), namesMatched: `${names}/${rows.length}`, unflaggedList: misses };
  console.log('TICKMARK BENCH', JSON.stringify(out));
  window.__bench = out;
  return out;
})();
