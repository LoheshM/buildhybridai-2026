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
    # WP2: without Nano, made-up sheets replay Gemini Nano's own recorded readings, labelled
    pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-science')
    pg.locator('.tile .pill').first.wait_for(timeout=30000); pg.wait_for_timeout(1000)
    chips = pg.locator('.tile .pill').all_text_contents()
    nano = sum(1 for c in chips if 'Nano' in c)
    check('science sheets replay Gemini Nano recordings, labelled', nano >= 23, f'{nano} of {len(chips)} chips')
    pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-science/results')
    pg.get_by_text('needed you').first.wait_for(timeout=30000)
    txt = pg.locator('main').inner_text()
    check('Results separates wrong marks with no flag from same-mark misreadings, and says how many needed you', 'changed the mark with no flag' in txt and 'needed you' in txt)
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
    # J5: a made-up class can be decided from its answer key, and undone
    pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-english/check')
    pg.get_by_role('button', name='Decide the rest from the answer key').click()
    pg.get_by_text("Decided from the made-up class's answer key").wait_for(timeout=20000)
    done = pg.get_by_text('Everything is decided.').count()
    check('J5: deciding from the answer key leaves nothing waiting', done == 1)
    pg.get_by_role('button', name='Undo').click(); pg.wait_for_timeout(1500)
    check('J5: Undo puts the waiting marks back', pg.get_by_text('Everything is decided.').count() == 0)
    # R6-4-01: typing a key whose detected type changes keeps every character
    pg.goto('about:blank'); pg.goto(f'{URL}/#/new')
    box = pg.get_by_label('Answer key 1')
    box.click(); pg.keyboard.type('light gives energy; to make food', delay=20)
    check('R6-4-01: typed key keeps every character', box.input_value() == 'light gives energy; to make food', box.input_value())
    # R6-4-04: after clicking a question in the Check list, J/Enter still work
    pg.goto('about:blank'); pg.goto(f'{URL}/#/quiz/sample-quiz-science/check/q/5')
    pg.locator('.qnav button').nth(2).click(); pg.wait_for_timeout(800)
    before = pg.locator('.ans.focus').count()
    pg.keyboard.press('j'); pg.wait_for_timeout(300)
    active = pg.evaluate("document.activeElement && document.activeElement.tagName")
    check('R6-4-04: shortcuts work after clicking a question', active != 'BUTTON' and pg.locator('.ans.focus').count() >= 1, f'active {active}, focus rows {before}')
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
