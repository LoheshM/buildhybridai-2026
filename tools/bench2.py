"""On-device bench of the v2 sample classes, through the real app, with Gemini Nano.

Starts the dedicated Chrome profile (demo_video/chrome-profile, Nano downloaded), opens each sample
class, resets it, clicks "Read all", waits for the run to finish, then evaluates tools/bench2.js.
usage (from app/): uv run --with playwright python tools/bench2.py <base-url> [maths science english]
Writes tools/samples/out/bench-<class>.json. A killed run can simply be restarted.
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

with sync_playwright() as p, chrome(p) as (browser, ctx):
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.set_default_timeout(60000)
    for cls in classes:
        page.goto("about:blank")
        page.goto(f"{base}/#/classes")
        page.wait_for_selector("text=Sample classes")
        # reset this class so every sheet is read fresh
        row = page.locator("section.classrow", has_text={"maths": "Maths 6B", "science": "Science 7A", "english": "English 8C"}[cls])
        row.get_by_role("button", name="Reset").click()
        page.wait_for_timeout(1500)
        page.goto(f"{base}/#/quiz/sample-quiz-{cls}")
        page.wait_for_selector("text=Gemini Nano ready", timeout=120000)
        page.get_by_role("button", name="Read all").click()
        t0 = time.time()
        while True:
            time.sleep(5)
            done = page.locator("text=/All \\d+ sheets read/").count() > 0
            status = page.locator("[role=status]").first.inner_text() if page.locator("[role=status]").count() else ""
            print(f"  {cls} {int(time.time() - t0)} s  {status[:70]!r}", flush=True)
            if done:
                break
            if time.time() - t0 > 1800:
                print("  gave up after 30 min", flush=True)
                break
        r = page.evaluate(JS, cls)
        (HERE / "samples" / "out" / f"bench-{cls}.json").write_text(json.dumps(r, indent=1), encoding="utf8")
        print(cls, json.dumps(r["summary"]), flush=True)
        for x in r["misses"][:10]:
            print("   unflagged:", x, flush=True)
        for x in r["openMisses"][:8]:
            print("   open:", x, flush=True)
