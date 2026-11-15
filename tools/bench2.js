// Evaluated in a Tickmark page after a sample class has been read (tools/bench2.py does this).
// Scores the stored readings against the generator's ground truth:
//   exact types: exact reads, misreads, UNFLAGGED misreads (the one that matters), flag rate
//   open types:  character error rate of the reading, and Gemini Nano's suggested mark vs the reference mark
async (cls) => {
  const m = await (await fetch(`/samples/${cls}/manifest.json`)).json();
  const truth = Object.fromEntries(m.students.map((s) => [s.id, s.answers]));
  const db = await new Promise((res, rej) => { const r = indexedDB.open('tickmark'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const sheets = await new Promise((res) => { const q = db.transaction('sheets').objectStore('sheets').getAll(); q.onsuccess = () => res(q.result); });
  const rows = sheets.filter((s) => s.quizId === `sample-quiz-${cls}` && (s.status === 'read' || s.status === 'checked'));
  // same written answer: case, spacing, a trailing full stop and a leading "0" before a decimal point don't count
  const norm = (s) => (s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').replace(/\s*\/\s*/g, '/').replace(/\s*([=°%])\s*/g, '$1').replace(/[.!]+$/, '').trim().replace(/(^|[^\d])0+(\.\d)/g, '$1$2');
  const words = (s) => (s || '').toLowerCase().replace(/[^\p{L}\p{N}' ]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const lev = (a, b) => { let p = Array.from({ length: b.length + 1 }, (_, i) => i); for (let i = 1; i <= a.length; i++) { const c = [i]; for (let j = 1; j <= b.length; j++) c.push(Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))); p = c; } return p[b.length]; };
  const qs = Object.fromEntries(m.quiz.questions.map((q) => [q.q, q]));
  const rubricMax = (key) => key.replace(/^\s*rubric\s*[:-]?\s*/i, '').split(/\s*(?:\n|;)\s*/).map((x) => Number((x.match(/(\d{1,2})\s*\)?\s*$/) || [])[1] || 0));
  const errors = sheets.filter((s) => s.quizId === `sample-quiz-${cls}` && s.status === 'error').map((s) => `${s.sampleId}: ${s.error}`);
  const out = { cls, errors, sheets: rows.length, onDevice: rows.filter((s) => s.where === 'on_device').length, exact: { answers: 0, exact: 0, misread: 0, unflagged: 0, flagged: 0 }, open: { answers: 0, chars: 0, errors: 0, suggested: 0, agree: 0, within1: 0, ms: 0 }, readMs: 0, suggestMs: 0, names: 0, misses: [], openMisses: [] };
  for (const s of rows) {
    const t = truth[s.sampleId];
    if (s.studentId === s.sampleId) out.names++;
    out.readMs += (s.ms || 0) + (s.rereadMs || 0);
    for (const mk of s.marks) {
      const want = t.find((a) => a.q === mk.q);
      const read = mk.modelRead ?? mk.read;
      if (mk.type === 'short' || mk.type === 'passage') {
        if (!want.written) continue;
        const a = words(want.written), b = words(read);
        out.open.answers++; out.open.chars += a.length; out.open.errors += lev(a, b);
        if (mk.suggestion) {
          out.open.suggested++; out.open.ms += mk.suggestion.ms || 0; out.suggestMs += mk.suggestion.ms || 0;
          const outOf = mk.outOf || 1;
          let ref = null;
          if (Array.isArray(want.ref) && typeof want.ref[0] === 'boolean') ref = Math.round((want.ref.filter(Boolean).length / want.ref.length) * outOf * 2) / 2;
          if (Array.isArray(want.ref) && typeof want.ref[0] === 'number') { const mx = rubricMax(qs[mk.q].key).reduce((x, y) => x + y, 0) || 1; ref = Math.round((want.ref.reduce((x, y) => x + y, 0) / mx) * outOf * 2) / 2; }
          if (ref !== null) {
            const d = Math.abs(mk.suggestion.points - ref);
            if (d < 0.01) out.open.agree++; if (d <= 1) out.open.within1++;
            else out.openMisses.push(`${s.sampleId} q${mk.q}: suggested ${mk.suggestion.points}, reference ${ref}`);
          }
        }
        continue;
      }
      const flagged = mk.modelFlagged ?? ((mk.flags || []).some((f) => f !== 'teacher_changed') || mk.status === 'unreadable');
      out.exact.answers++;
      if (flagged) out.exact.flagged++;
      if (norm(read) === norm(want.written)) out.exact.exact++;
      else { out.exact.misread++; if (!flagged) { out.exact.unflagged++; out.misses.push(`${s.sampleId} q${mk.q}: "${read}" (truth "${want.written}") ${mk.status}`); } }
    }
  }
  out.summary = {
    exactPct: +(100 * out.exact.exact / Math.max(1, out.exact.answers)).toFixed(1),
    unflagged: `${out.exact.unflagged}/${out.exact.answers}`,
    flagRatePct: +(100 * out.exact.flagged / Math.max(1, out.exact.answers)).toFixed(1),
    openCharsRightPct: out.open.chars ? +(100 - 100 * out.open.errors / out.open.chars).toFixed(1) : null,
    suggestAgree: out.open.suggested ? `${out.open.agree}/${out.open.suggested}` : null,
    suggestWithin1: out.open.suggested ? `${out.open.within1}/${out.open.suggested}` : null,
    secsPerSheet: +((out.readMs + out.suggestMs) / 1000 / Math.max(1, rows.length)).toFixed(1),
    readSecsPerSheet: +(out.readMs / 1000 / Math.max(1, rows.length)).toFixed(1),
    suggestSecs: out.open.suggested ? +(out.open.ms / 1000 / out.open.suggested).toFixed(1) : null,
    names: `${out.names}/${rows.length}`,
  };
  return out;
}
