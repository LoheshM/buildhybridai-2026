# Round 5 (S1/F4-05): crops stored before a failed read must go with "Remove sheet", "Delete photos" and "Delete class".
# Usage: uv run --with playwright python tools/crops-delete-check.py [dev-url]
import sys
from playwright.sync_api import sync_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5175'
JS = """async () => {
  const { store } = await import('/src/store/db.ts');
  const out = {};
  const blob = new Blob(['x'], { type: 'image/jpeg' });
  const mk = async (tag) => {
    const cls = { id: 'c-' + tag, name: 'T ' + tag, roster: [], createdAt: Date.now() };
    const quiz = { id: 'qz-' + tag, classId: cls.id, title: 'T', keys: [], unsimplifiedCredit: 0.5, createdAt: Date.now() };
    const sheet = { id: 's-' + tag, quizId: quiz.id, status: 'error', marks: [], createdAt: Date.now() };
    await store.putClass(cls); await store.putQuiz(quiz); await store.putSheet(sheet);
    for (const q of [1, 2, 3]) await store.putImage(`${sheet.id}#q${q}`, blob); // crops not listed on the sheet: the read failed
    await store.putImage(`${sheet.id}x#q1`, blob); // a different sheet id sharing the prefix must survive
    return { cls, quiz, sheet };
  };
  const left = async (id) => { let n = 0; for (const q of [1, 2, 3]) if (await store.image(`${id}#q${q}`)) n++; return n; };
  let t = await mk('a'); await store.deleteSheet(t.sheet); out.removeSheet = await left(t.sheet.id); out.neighbour = !!(await store.image(`${t.sheet.id}x#q1`));
  t = await mk('b'); await store.deletePhotos(t.quiz.id); out.deletePhotos = await left(t.sheet.id);
  t = await mk('c'); await store.deleteClass(t.cls.id); out.deleteClass = await left(t.sheet.id);
  for (const k of ['a', 'b', 'c']) { await store.deleteClass('c-' + k); }
  return out;
}"""
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', headless=True)
    pg = b.new_page()
    pg.goto(URL + '/#/privacy')
    r = pg.evaluate(JS)
    b.close()
ok = r['removeSheet'] == 0 and r['deletePhotos'] == 0 and r['deleteClass'] == 0 and r['neighbour']
print(r)
print('PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
