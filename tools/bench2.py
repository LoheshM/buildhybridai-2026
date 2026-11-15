"""On-device bench of the v2 sample classes, through the real app, with Gemini Nano.

Starts the dedicated Chrome profile (demo_video/chrome-profile, Nano downloaded), opens each sample
class, resets it, clicks "Read all", waits for the run to finish, then evaluates tools/bench2.js.
usage (from app/): uv run --with playwright python tools/bench2.py <base-url> [maths science english] [--record]
Writes tools/samples/out/bench-<class>.json. A killed run can simply be restarted.
With --record (dev server only), also writes public/samples/<class>/recorded-device.json: Gemini Nano's raw
output for every sample sheet, replayed (labelled) in browsers without on-device AI.
"""
import json
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent.parent / "demo_video"))
from playwright.sync_api import sync_playwright  # noqa: E402
from profile import chrome  # noqa: E402

base = sys.argv[1].rstrip("/")
classes = sys.argv[2:] or ["science", "english", "maths"]
JS = (HERE / "bench2.js").read_text(encoding="utf8")
RECORD = "--record" in sys.argv
Q = "?record" if RECORD else ""
PROMPTS_VERSION = __import__("re").search(r"PROMPTS_VERSION = '([^']+)'", (HERE.parent / "src" / "ai" / "prompts.ts").read_text(encoding="utf8")).group(1)

with sync_playwright() as p, chrome(p) as (browser, ctx):
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.set_default_timeout(60000)
    eval_only = "--eval-only" in sys.argv
    for cls in [c for c in classes if not c.startswith("--")]:
        if eval_only:
            page.goto(f"{base}/#/classes"); page.wait_for_timeout(2000)
            r = page.evaluate(JS, cls)
            print(cls, json.dumps(r["summary"]), flush=True)
            for x in r.get("allMisses", [])[:80]:
                print("   ", x, flush=True)
            continue
        page.goto("about:blank")
        page.goto(f"{base}/{Q}#/classes")
        page.wait_for_selector("text=Sample classes")
        # reset this class so every sheet is read fresh
        row = page.locator("section.classrow", has_text={"maths": "Maths 6B", "science": "Science 7A", "english": "English 8C"}[cls])
        row.get_by_role("button", name="Reset").click()
        page.wait_for_timeout(1500)
        page.goto(f"{base}/{Q}#/quiz/sample-quiz-{cls}")
        page.wait_for_selector("text=Gemini Nano ready", timeout=120000)
        page.get_by_role("button", name="Read all").click()
        t0 = time.time()
        idle = 0
        while True:
            time.sleep(5)
            running = page.get_by_role("button", name="Stop").count() > 0
            idle = 0 if running else idle + 1
            done = page.locator("text=/All \\d+ sheets read/").count() > 0 or idle >= 3  # finished, possibly with errors
            status = page.locator("[role=status]").first.inner_text() if page.locator("[role=status]").count() else ""
            print(f"  {cls} {int(time.time() - t0)} s  {status[:70]!r}", flush=True)
            if done:
                break
            if time.time() - t0 > 1800:
                print("  gave up after 30 min", flush=True)
                break
        if RECORD:
            cap = page.evaluate("() => window.__tickmarkCapture || null")
            ua = page.evaluate("() => navigator.userAgent")
            man = json.loads((HERE.parent / "public" / "samples" / cls / "manifest.json").read_text(encoding="utf8"))
            ids = [x["id"] for x in man["students"]]
            if not cap:
                print("  no capture: is this the dev server, opened with ?record?", flush=True)
            else:
                reads = {k: v for k, v in cap["reads"].items() if k in ids}
                sugg = {k: v for k, v in cap["suggestions"].items() if k.split(":")[0] in ids}
                chrome_v = __import__("re").search(r"Chrome/(\d+)", ua)
                rec = {"recordedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "model": "Gemini Nano (Chrome Prompt API, through Firebase AI Logic)",
                       "chrome": f"Chrome {chrome_v.group(1) if chrome_v else '?'}", "promptsVersion": PROMPTS_VERSION,
                       "reads": reads, "suggestions": sugg, "missing": [i for i in ids if i not in reads]}
                out = HERE.parent / "public" / "samples" / cls / "recorded-device.json"
                out.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf8")
                print(f"  recorded {len(reads)}/{len(ids)} sheets, {len(sugg)} suggestions -> {out.name}; missing {rec['missing']}", flush=True)
        r = page.evaluate(JS, cls)
        (HERE / "samples" / "out" / f"bench-{cls}.json").write_text(json.dumps(r, indent=1), encoding="utf8")
        print(cls, json.dumps(r["summary"]), flush=True)
        for x in r["errors"][:10]:
            print("   error:", x, flush=True)
        for x in r["misses"][:10]:
            print("   unflagged:", x, flush=True)
        for x in r["openMisses"][:8]:
            print("   open:", x, flush=True)
