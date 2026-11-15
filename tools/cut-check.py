# Answer-sheet regression: every sample photo must be found (four corner squares) and every box judged blank or written correctly.
# usage (dev server running on 5175): uv run --with playwright python tools/cut-check.py
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page()
    pg.goto("http://localhost:5175/#/"); pg.wait_for_timeout(2000)
    r = pg.evaluate("""async () => {
      const C = await import('/src/img/crop.ts');
      const out = []; let ok = 0, n = 0, blankRight = 0, blankWrong = 0, ms = 0;
      for (const cls of ['maths', 'science', 'english']) {
        const m = await (await fetch(`/samples/${cls}/manifest.json`, {cache:'no-store'})).json();
        const keys = m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
        for (const s of m.students) {
          n++;
          try {
            const c = await C.cutAnswerSheet(await (await fetch(`/samples/${cls}/${s.id}.jpg`, {cache:'no-store'})).blob(), keys);
            ok++; ms += c.ms;
            for (const a of s.answers) { const isBlank = !a.written && !a.crossedOut; const said = c.blank.includes(a.q); if (isBlank === said) blankRight++; else { blankWrong++; out.push(`${s.id} q${a.q} truth ${isBlank ? 'blank' : 'written'} code ${said ? 'blank' : 'ink'}`); } }
          } catch (e) { out.push(`${s.id} ${e.name}`); }
        }
      }
      out.unshift(`sheets found ${ok}/${n}; blank decisions right ${blankRight}, wrong ${blankWrong}; ${Math.round(ms / ok)} ms per sheet`);
      return out;
    }""")
    print("\n".join(r[:20]))
    b.close()
