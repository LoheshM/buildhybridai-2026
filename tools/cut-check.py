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
      // E15: the same photos upside down must come back with every answer box blank, so the runner refuses to score them
      let upside = 0, upsideAllBlank = 0;
      for (const cls of ['maths', 'science', 'english']) {
        const m = await (await fetch(`/samples/${cls}/manifest.json`, {cache:'no-store'})).json();
        const keys = m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
        for (const s of m.students.slice(0, 8)) {
          const bmp = await createImageBitmap(await (await fetch(`/samples/${cls}/${s.id}.jpg`, {cache:'no-store'})).blob());
          const cv = new OffscreenCanvas(bmp.width, bmp.height); const cx = cv.getContext('2d');
          cx.translate(bmp.width, bmp.height); cx.rotate(Math.PI); cx.drawImage(bmp, 0, 0);
          upside++;
          // turned the right way up again: the same blank decisions as the upright photo
          try { const c = await C.cutAnswerSheet(await cv.convertToBlob({ type: 'image/jpeg', quality: 0.9 }), keys); const truth = s.answers.filter((a) => !a.written && !a.crossedOut).map((a) => a.q).sort().join(','); const got = [...c.blank].sort().join(','); if (truth === got) upsideAllBlank++; else out.push(`${s.id} upside down: blank ${got} truth ${truth}`); }
          catch (e) { out.push(`${s.id} upside down: ${e.name}`); }
        }
      }
      out.unshift(`upside-down photos turned upright (blank decisions match): ${upsideAllBlank}/${upside}`);
      // F4-02: a photo of another quiz's answer sheet is refused, never scored
      const K = {};
      for (const cls of ['maths', 'science', 'english']) { const m = await (await fetch(`/samples/${cls}/manifest.json`, {cache:'no-store'})).json(); K[cls] = m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key })); }
      let cross = 0, crossRefused = 0;
      for (const [id, cls] of [['m01','maths'],['m09','maths'],['c01','science'],['c09','science'],['e01','english'],['e09','english']]) {
        const blob = await (await fetch(`/samples/${cls}/${id}.jpg`, {cache:'no-store'})).blob();
        for (const other of Object.keys(K)) { if (other === cls) continue; cross++;
          try { await C.cutAnswerSheet(blob, K[other]); out.push(`${id} with the ${other} key was NOT refused`); } catch (e) { if (e.name === 'LayoutMismatch') crossRefused++; else out.push(`${id} as ${other}: ${e.name}`); } }
      }
      out.unshift(`photos of another quiz's sheet refused: ${crossRefused}/${cross}`);
      out.unshift(`sheets found ${ok}/${n}; blank decisions right ${blankRight}, wrong ${blankWrong}; ${Math.round(ms / ok)} ms per sheet`);
      return out;
    }""")
    print("\n".join(r[:20]))
    b.close()
