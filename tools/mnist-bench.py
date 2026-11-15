"""Round 5 WP6: Gemini Nano on REAL human handwriting (MNIST digits) on Tickmark answer sheets.

Runs the app's own pipeline in the Nano Chrome profile: cut the sheet, read the strip on the device, mark,
second read of what the code asks about, mark again. Scores against tools/samples/out/mnist2/truth.json.
usage (from app/, a dev server on the given URL): uv run --with playwright python tools/mnist-bench.py [http://localhost:5176]
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "demo_video"))
from playwright.sync_api import sync_playwright  # noqa: E402
from profile import chrome  # noqa: E402

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5176"
SET = HERE / "samples" / "out" / "mnist2"
truth = json.loads((SET / "truth.json").read_text(encoding="utf8"))

JS = """async (truth) => {
  const C = await import('/src/img/crop.ts');
  const T = await import('/src/ai/tasks.ts');
  const I = await import('/src/ai/images.ts');
  const P = await import('/src/marking/pipeline.ts');
  const M = await import('/src/marking/mark.ts');
  const keys = truth.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
  const norm = (s) => (s || '').normalize('NFKC').toLowerCase().replace(/\\s+/g, ' ').replace(/\\s*\\/\\s*/g, '/').replace(/[.!]+$/, '').trim().replace(/(^|[^\\d])0+(\\.\\d)/g, '$1$2');
  const o = { sheets: 0, errors: [], answers: 0, exact: 0, wrongMarkUnflagged: 0, readDiffSameMark: 0, flagged: 0, blankRight: 0, blankWrong: 0, ms: 0, misses: [] };
  for (const s of truth.students) {
    try {
      const blob = await (await fetch(`/mnist2/${s.id}.jpg`)).blob();
      const t0 = performance.now();
      const cut = await C.cutAnswerSheet(blob, keys);
      let read = null;
      const chunks = [];
      for (const c of cut.strips) chunks.push({ img: await I.classify(c.blob), qs: c.qs });
      for (const c of chunks) {
        const r = await T.readStrip(c.img, keys, chunks.length === 1 ? cut.blank : keys.map((k) => k.q).filter((q) => !c.qs.includes(q)), 'student');
        if (!read) read = r.read; else for (const a of r.read.answers) if (c.qs.includes(a.q)) Object.assign(read.answers.find((x) => x.q === a.q), a);
      }
      for (const a of read.answers) if (cut.blank.includes(a.q)) { a.finalAnswer = ''; a.crossedOutText = ''; }
      let marks = P.markRead(keys, read);
      const qs = P.rereadQuestions(keys, marks);
      if (qs.length) { const second = await T.rereadStrip(chunks[0].img, qs, keys, 'student'); marks = P.mergeReread(marks, second.answers, keys); }
      marks = marks.map((m) => (!m.read.trim() && !cut.blank.includes(m.q) ? { ...m, status: 'unreadable', flags: [...new Set([...m.flags, 'unreadable'])] } : m));
      o.ms += performance.now() - t0; o.sheets++;
      for (const m of marks) {
        const want = s.answers.find((a) => a.q === m.q).written;
        const isBlank = !want;
        if (isBlank === cut.blank.includes(m.q)) o.blankRight++; else o.blankWrong++;
        if (isBlank) continue;
        o.answers++;
        const flagged = P.needsCheck(m);
        if (flagged) o.flagged++;
        if (norm(m.read) === norm(want)) { o.exact++; continue; }
        const k = keys.find((x) => x.q === m.q);
        if (M.markAnswer(k, m.read).status === M.markAnswer(k, want).status) o.readDiffSameMark++;
        else if (!flagged) { o.wrongMarkUnflagged++; o.misses.push(`${s.id} q${m.q} wrote ${want} read ${m.read}`); }
      }
    } catch (e) { o.errors.push(`${s.id}: ${e.name} ${e.message}`.slice(0, 140)); }
  }
  return o;
}"""

with sync_playwright() as p, chrome(p) as (browser, ctx):
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.set_default_timeout(1800000)
    page.route("**/mnist2/*.jpg", lambda route: route.fulfill(path=str(SET / route.request.url.rsplit("/", 1)[1]), content_type="image/jpeg"))
    page.goto(URL + "/#/privacy")
    page.wait_for_timeout(4000)
    r = page.evaluate(JS, truth)
(SET / "bench.json").write_text(json.dumps(r, indent=1), encoding="utf8")
print(f"sheets {r['sheets']}/{len(truth['students'])}; exact {r['exact']}/{r['answers']} ({100 * r['exact'] / max(1, r['answers']):.1f}%); "
      f"wrong mark with no flag {r['wrongMarkUnflagged']}; misread same mark {r['readDiffSameMark']}; flagged {r['flagged']}; "
      f"blank decisions {r['blankRight']} right {r['blankWrong']} wrong; {r['ms'] / 1000 / max(1, r['sheets']):.1f} s per sheet; errors {r['errors'][:3]}")
for x in r["misses"][:20]:
    print("  ", x)
