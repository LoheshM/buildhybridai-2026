"""Real human handwriting on Tickmark answer sheets (round 5, WP6).

Renders blank maths answer sheets (sheet3.html, only the name written), then writes each made-up pupil's
answers into the boxes with REAL handwritten digits from the MNIST test set (LeCun, Cortes, Burges;
CC BY-SA 3.0), fraction bars and decimal points as pen strokes, and photo-processes them like the sample
class. Answers with letters ("x = 4", "350 mm") are left blank and recorded as blank. Output (not
deployed): tools/samples/out/mnist2/<id>.jpg and truth.json.
Usage (from app/): uv run --with pillow python -I tools/samples/mnist2.py <folder with MNIST t10k .gz files>
"""
import base64
import json
import random
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from mnist import glyph, load_mnist  # noqa: E402

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
PX = 6  # the sheet renders at 1260 x 1782 for 210 x 297 mm
RAW = HERE / "out" / "mnist2-raw"
OUT = HERE / "out" / "mnist2"
DIGITS_ONLY = set("0123456789/ .-")


def write(page, text, x, y, by_digit, rows, cols, rng, ink, height):
    d = ImageDraw.Draw(page)
    for ch in text:
        if ch.isdigit():
            gl = glyph(rng.choice(by_digit[int(ch)]), rows, cols, int(height * rng.uniform(0.9, 1.06)), ink, rng)
            page.alpha_composite(gl, (int(x), int(y + rng.uniform(-2, 2))))
            x += gl.width + rng.uniform(1, 4)
        elif ch == "/":
            d.line([(x + 3, y + height + rng.uniform(-2, 2)), (x + 3 + height * 0.4, y - 2)], fill=ink + (255,), width=4)
            x += height * 0.5
        elif ch == ".":
            r = 3
            d.ellipse([x + 2, y + height - 2 * r, x + 2 + 2 * r, y + height], fill=ink + (255,))
            x += 12
        elif ch == "-":
            d.line([(x + 2, y + height / 2), (x + height * 0.4, y + height / 2 + rng.uniform(-2, 2))], fill=ink + (255,), width=4)
            x += height * 0.5
        elif ch == " ":
            x += height * 0.45 + rng.uniform(0, 6)
    return x


def main():
    by_digit, rows, cols = load_mnist(Path(sys.argv[1]))
    m = json.loads((HERE / "out" / "maths" / "manifest.json").read_text(encoding="utf8"))
    layout = json.loads((HERE / "out" / "maths" / "layout.json").read_text(encoding="utf8"))
    boxes = {b["q"]: b for b in layout["boxes"]}
    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    inks = [(27, 47, 138), (29, 29, 29), (36, 64, 143), (15, 61, 122)]
    truth = {"quiz": m["quiz"], "students": []}
    for i, s in enumerate(m["students"]):
        rng = random.Random(f"mnist2-{s['id']}")
        sid = "n" + s["id"][1:]
        data3 = {"seed": 900 + i * 37, "title": m["quiz"]["title"], "className": m["quiz"]["className"],
                 "name": s["name"].split(" ")[0] + " " + s["name"].split(" ")[1][0] + ".", "font": "Kalam", "size": 34,
                 "ink": "#1b2f8a", "layout": layout, "answers": [{"q": a["q"], "written": "", "crossedOut": ""} for a in s["answers"]]}
        h = base64.b64encode(json.dumps(data3, ensure_ascii=False).encode("utf8")).decode()
        out = RAW / f"{sid}.png"
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", f"--screenshot={out}",
                        "--window-size=1260,1782", "--virtual-time-budget=10000", (HERE / "sheet3.html").as_uri() + "#" + h], check=True, capture_output=True)
        page = Image.open(out).convert("RGBA")
        ink = inks[i % len(inks)]
        answers = []
        for a in s["answers"]:
            text = a["written"] if set(a["written"]) <= DIGITS_ONLY else ""
            b = boxes[a["q"]]
            if text:
                height = int(b["h"] * PX * 0.55)
                write(page, text, (b["x"] + 4) * PX + rng.uniform(0, 30), (b["y"] * PX) + (b["h"] * PX - height) / 2, by_digit, rows, cols, rng, ink, height)
            answers.append({"q": a["q"], "written": text})
        page.convert("RGB").save(out)
        truth["students"].append({"id": sid, "name": s["name"], "answers": answers})
        print("wrote", sid, flush=True)
    (OUT / "truth.json").write_text(json.dumps(truth, indent=1, ensure_ascii=False), encoding="utf8")
    subprocess.run(["uv", "run", "-q", "--with", "pillow", "python", "-I", str(HERE / "photo.py"), str(RAW), str(OUT)], check=True)
    print("photos in", OUT)


if __name__ == "__main__":
    main()
