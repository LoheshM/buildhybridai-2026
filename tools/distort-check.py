"""Round 5 WP6: does cutting the answer sheet survive bad phone photos?
Takes 12 sample photos (4 per class) through 7 distortions each, in the browser, and counts corner failures,
false "another quiz" refusals and wrong blank-box decisions. Code only: no AI.
usage (dev server running): uv run --with playwright python tools/distort-check.py [http://localhost:5175]
"""
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:5175"
JS = """async () => {
  const C = await import('/src/img/crop.ts');
  const S = await import('/src/img/sheet.ts');
  const D = {
    'tilt +10°': (cx, w, h, img) => { cx.translate(w / 2, h / 2); cx.rotate(10 * Math.PI / 180); cx.drawImage(img, -w / 2, -h / 2); },
    'tilt -10°': (cx, w, h, img) => { cx.translate(w / 2, h / 2); cx.rotate(-10 * Math.PI / 180); cx.drawImage(img, -w / 2, -h / 2); },
    'perspective': 'projective',
    'blur 2px': (cx, w, h, img) => { cx.filter = 'blur(2px)'; cx.drawImage(img, 0, 0); },
    'low light': (cx, w, h, img) => { cx.filter = 'brightness(0.55) contrast(0.8)'; cx.drawImage(img, 0, 0); },
    'shadow': (cx, w, h, img) => { cx.drawImage(img, 0, 0); const g = cx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); cx.fillStyle = g; cx.fillRect(0, 0, w, h); },
    'jpeg q50': (cx, w, h, img) => { cx.drawImage(img, 0, 0); },
    'hard shadow band': (cx, w, h, img) => { cx.drawImage(img, 0, 0); cx.fillStyle = 'rgba(0,0,0,0.38)'; cx.fillRect(0, h * 0.3, w, h * 0.12); },
    'dim + noise': (cx, w, h, img) => { cx.filter = 'brightness(0.5)'; cx.drawImage(img, 0, 0); cx.filter = 'none'; const d = cx.getImageData(0, 0, w, h); let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; for (let i = 0; i < d.data.length; i += 4) { const n = (rnd() + rnd() + rnd() - 1.5) * 20; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } cx.putImageData(d, 0, 0); },
    'blur 3px': (cx, w, h, img) => { cx.filter = 'blur(3px)'; cx.drawImage(img, 0, 0); },
  };
  globalThis.__frames = location.hash.includes('frames');
  const out = { total: 0, found: 0, mismatch: 0, other: [], blankRight: 0, blankWrong: 0, byKind: {} };
  for (const cls of ['maths', 'science', 'english']) {
    const m = await (await fetch(`/samples/${cls}/manifest.json`)).json();
    const keys = m.quiz.questions.map((q) => ({ q: q.q, prompt: q.prompt, answer: q.key }));
    for (const s of m.students.slice(0, 4)) {
      const img = await createImageBitmap(await (await fetch(`/samples/${cls}/${s.id}.jpg`)).blob());
      for (const [kind, f] of Object.entries(D)) {
        // a bigger canvas (desk round the photo), so a tilted sheet keeps its four squares in view, as the sheet asks
        const W = Math.round(img.width * 1.25), H = Math.round(img.height * 1.25);
        const cv = new OffscreenCanvas(W, H); const cx = cv.getContext('2d');
        cx.fillStyle = '#5a4634'; cx.fillRect(0, 0, W, H);
        if (f === 'projective') {
          // a real camera keystone: the top edge 18% narrower, through a homography
          const src = new OffscreenCanvas(W, H); const sx = src.getContext('2d'); sx.fillStyle = '#5a4634'; sx.fillRect(0, 0, W, H); sx.drawImage(img, (W - img.width) / 2, (H - img.height) / 2);
          const sd = sx.getImageData(0, 0, W, H), dd = cx.getImageData(0, 0, W, H);
          const Hm = S.homography([[W * 0.09, H * 0.04], [W * 0.91, H * 0.04], [W, H], [0, H]], [[0, 0], [W, 0], [W, H], [0, H]]);
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const [u, v] = S.apply(Hm, x, y); const ui = Math.round(u), vi = Math.round(v); if (ui < 0 || vi < 0 || ui >= W || vi >= H) continue; const o = (y * W + x) * 4, i = (vi * W + ui) * 4; dd.data[o] = sd.data[i]; dd.data[o + 1] = sd.data[i + 1]; dd.data[o + 2] = sd.data[i + 2]; dd.data[o + 3] = 255; }
          cx.putImageData(dd, 0, 0);
        } else {
          // the photo on the desk first, then the distortion applied to the whole frame (light and blur hit the desk too)
          const base = new OffscreenCanvas(W, H); const bx = base.getContext('2d'); bx.fillStyle = '#5a4634'; bx.fillRect(0, 0, W, H); bx.drawImage(img, (W - img.width) / 2, (H - img.height) / 2);
          f(cx, W, H, base);
        }
        const blob = await cv.convertToBlob({ type: 'image/jpeg', quality: kind === 'jpeg q50' ? 0.5 : 0.9 });
        out.total++; out.byKind[kind] ??= { ok: 0, fail: 0 };
        try {
          const c = await C.cutAnswerSheet(blob, keys); out.found++; out.byKind[kind].ok++;
          for (const a of s.answers) { const isBlank = !a.written && !a.crossedOut; if (isBlank === c.blank.includes(a.q)) out.blankRight++; else { out.blankWrong++; (out.blankBy ??= {})[kind] = (out.blankBy[kind] ?? 0) + 1; if (!isBlank) out.inkMissed = (out.inkMissed ?? 0) + 1; } }
        } catch (e) { out.byKind[kind].fail++; if (e.name === 'LayoutMismatch') out.mismatch++; else if (e.name === 'BlurredPhoto') out.blurred = (out.blurred ?? 0) + 1; else out.other.push(`${s.id} ${kind}: ${e.name}`); }
        if (globalThis.__frames) { try { const bx = await C.answerBoxes(blob, keys); (out.frames ??= {})[kind] = Math.min(out.frames[kind] ?? 1, ...bx.map((x) => x.frame)); } catch { /* no corners */ } }
      }
    }
  }
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    pg = b.new_page(); pg.set_default_timeout(900000)
    pg.goto(URL + ("/#/frames" if "--frames" in sys.argv else "/#/")); pg.wait_for_timeout(2000)
    r = pg.evaluate(JS)
    b.close()
print(f"cut {r['found']}/{r['total']} distorted photos; refused as blurred {r.get('blurred', 0)} (expected: the 3 px blur set); refused as another quiz {r['mismatch']}; other failures {len(r['other'])}; blank decisions {r['blankRight']} right, {r['blankWrong']} wrong")
for k, v in r["byKind"].items(): print(f"  {k}: {v['ok']} ok, {v['fail']} failed")
for x in r["other"][:10]: print("  ", x)
print("wrong blank decisions by distortion:", r.get("blankBy"), "written boxes called blank:", r.get("inkMissed", 0))
if r.get("frames"): print("lowest frame score per distortion:", {k: round(v, 2) for k, v in r["frames"].items()})
