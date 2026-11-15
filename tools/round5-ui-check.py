# Round 5 UI regressions, fresh headless Chrome (no Nano: sample classes use their recordings).
#  F4-03: Check opened without a question pins the first waiting one; deciding all its rows never moves to another question.
#  F4-04: a plan on one quiz never shows on another quiz's Plan page after a hash change.
# Usage (dev server on 5175): uv run --with playwright python tools/round5-ui-check.py [url]
import re
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5175'
res = []
def check(name, ok, extra=''):
    res.append(ok); print(('PASS ' if ok else 'FAIL ') + name + (f' ({extra})' if extra else ''), flush=True)

with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    pg = b.new_page(viewport={'width': 1366, 'height': 900})
    pg.on('dialog', lambda d: d.accept())
    for cls, n in [('science', 24), ('english', 18)]:
        pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-{cls}')
        pg.get_by_role('button', name=re.compile('^Read all')).click()
        pg.get_by_text(re.compile(f'All {n} sheets read')).wait_for(timeout=300000)
    # F4-03
    pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-science/check')
    pg.wait_for_url(re.compile(r'/check/q/\d+$'), timeout=20000)
    qn = int(re.search(r'/q/(\d+)$', pg.url).group(1))
    head = pg.locator('#q-h').inner_text()
    check('Check without a question pins the first waiting question in the URL', head.startswith(f'{qn}.'), f'q{qn}: {head[:40]}')
    waiting = pg.locator('.ans').count()
    for _ in range(waiting + 3):
        pg.keyboard.press('Enter'); pg.wait_for_timeout(250)
    head2 = pg.locator('#q-h').inner_text()
    check('deciding every row of that question stays on it', head2.startswith(f'{qn}.') and pg.url.endswith(f'/q/{qn}'), head2[:40])
    # F4-04
    pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-english/reteach')
    pg.get_by_role('button', name=re.compile('Send the class totals')).click()
    pg.locator('#plan-h').wait_for(timeout=90000)
    pg.evaluate("location.hash = '#/quiz/sample-quiz-science/reteach'")
    pg.wait_for_timeout(2500)
    plan_shown = pg.locator('#plan-h').count()
    again = pg.get_by_role('button', name=re.compile('again')).count()
    check("another quiz's Plan page doesn't show the previous quiz's plan", plan_shown == 0 and again == 0, f'plan {plan_shown}, again {again}')
    b.close()
print('ALL PASS' if all(res) else 'SOME CHECKS FAILED')
sys.exit(0 if all(res) else 1)
