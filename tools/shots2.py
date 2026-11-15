"""Screenshots of every screen WITH data, for design reviews. Headless Chrome, no Gemini Nano:
each sample class is read from the recorded cloud readings, so the run is repeatable.

usage (from app/): uv run --with playwright python tools/shots2.py <base-url> <out-dir> [--classes science,english] [--plan] [--theme dark]
Writes <screen>-<width>[-dark].png and reports any horizontal overflow.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip("/")
out = Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
classes = sys.argv[sys.argv.index("--classes") + 1].split(",") if "--classes" in sys.argv else ["science", "english", "maths"]
plan = "--plan" in sys.argv
theme = sys.argv[sys.argv.index("--theme") + 1] if "--theme" in sys.argv else "light"
OPEN_Q = {"science": 6, "english": 7, "maths": 6}


def shot(page, name, w):
    page.wait_for_timeout(700)
    suffix = "" if theme == "light" else f"-{theme}"
    page.screenshot(path=str(out / f"{name}-{w}{suffix}.png"), full_page=True)
    sw = page.evaluate("document.documentElement.scrollWidth")
    print("shot", name, w, theme, f"OVERFLOW {sw}" if sw > w else "", flush=True)


with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, color_scheme=theme)
    page = ctx.new_page()
    page.set_default_timeout(120000)
    page.goto(base + "/#/")
    page.evaluate(f"localStorage.setItem('tickmark.theme', '{theme}')")
    for cls in classes:
        q = f"sample-quiz-{cls}"
        page.goto("about:blank"); page.goto(f"{base}/#/quiz/{q}")
        page.wait_for_selector("text=/waiting|All \\d+ sheets read/")
        if page.get_by_role("button", name="Read all").count():
            page.get_by_role("button", name="Read all").click()
            page.wait_for_selector("text=/All \\d+ sheets read/", timeout=600000)
        for w in (1440, 390):
            page.set_viewport_size({"width": w, "height": 900 if w > 800 else 844})
            for name, route in [("scan", f"#/quiz/{q}"), ("check-q", f"#/quiz/{q}/check/q/{OPEN_Q[cls]}"), ("results", f"#/quiz/{q}/results"), ("reteach", f"#/quiz/{q}/reteach")]:
                page.goto("about:blank"); page.goto(f"{base}/{route}")
                page.wait_for_timeout(1500)
                shot(page, f"{cls}-{name}", w)
            page.goto("about:blank"); page.goto(f"{base}/#/quiz/{q}/check")
            page.get_by_role("tab", name="By sheet").click()
            shot(page, f"{cls}-check-sheet", w)
        page.set_viewport_size({"width": 1440, "height": 900})
        if plan:
            page.goto("about:blank"); page.goto(f"{base}/#/quiz/{q}/reteach")
            page.get_by_role("button", name="Send the class totals and plan the lesson").click()
            page.wait_for_selector("#plan-h", timeout=120000)
            shot(page, f"{cls}-plan", 1440)
    for w in (1440, 390):
        page.set_viewport_size({"width": w, "height": 900 if w > 800 else 844})
        for name, route in [("welcome", "#/"), ("classes", "#/classes"), ("privacy", "#/privacy")]:
            page.goto("about:blank"); page.goto(f"{base}/{route}")
            page.wait_for_timeout(3500)
            shot(page, name, w)
    b.close()
