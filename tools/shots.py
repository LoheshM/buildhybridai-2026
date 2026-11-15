"""Screenshots of the running app at 1440 and 390 px wide, light and dark, for design review.

usage: uv run --with playwright python tools/shots.py <base-url> <out-dir> [route ...]
Routes are hash routes such as "#/" or "#/new"; "new+science" opens New quiz and loads the Science template.
Uses the installed Chrome (headless): no Gemini Nano, so device-dependent states show the no-Nano path.
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

base, out = sys.argv[1], Path(sys.argv[2])
routes = sys.argv[3:] or ["#/", "#/classes", "new+science"]
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch(channel="chrome", headless=True)
    for theme in ("light", "dark"):
        for w, h in ((1440, 900), (390, 844)):
            ctx = b.new_context(viewport={"width": w, "height": h}, device_scale_factor=1 if w > 800 else 2, color_scheme=theme)
            page = ctx.new_page()
            page.goto(base + "/#/")
            page.evaluate(f"localStorage.setItem('tickmark.theme', '{theme}')")
            for r in routes:
                hash_ = "#/new" if r.startswith("new+") else r
                page.goto("about:blank")
                page.goto(base + "/" + hash_)
                page.wait_for_timeout(1500)
                if r.startswith("new+"):
                    page.get_by_role("button", name=r.split("+")[1].title(), exact=False).first.click()
                    page.wait_for_timeout(400)
                page.wait_for_timeout(2600)  # let the welcome demo finish inking
                name = (r.strip("#/").replace("/", "-").replace("+", "-") or "welcome")
                page.screenshot(path=str(out / f"{name}-{w}-{theme}.png"), full_page=True)
                sw = page.evaluate("document.documentElement.scrollWidth")
                print("shot", name, w, theme, "OVERFLOW %d" % sw if sw > w else "", flush=True)
            ctx.close()
    b.close()
