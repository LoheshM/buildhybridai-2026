"""Real-handwriting benchmark sheets.

Takes the blank-answer worksheets (render.mjs --blank) and writes each student's answers with
REAL human handwritten digits from the MNIST test set (Yann LeCun, Corinna Cortes, Christopher
Burges; CC BY-SA 3.0). Fraction bars and strike-throughs are drawn as pen strokes. The result is
photo-processed like the sample class and written to tools/samples/out/mnist/ (not deployed).

Usage: python -I tools/samples/mnist.py <folder with MNIST t10k .gz files>
"""
import gzip
import random
import struct
import sys
from pathlib import Path
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
RAW = HERE / "out" / "raw-blank"
OUT_RAW = HERE / "out" / "mnist-raw"
OUT_RAW.mkdir(parents=True, exist_ok=True)


def load_mnist(folder: Path):
    with gzip.open(folder / "t10k-images-idx3-ubyte.gz") as f:
        _, n, rows, cols = struct.unpack(">IIII", f.read(16))
        data = f.read()
    with gzip.open(folder / "t10k-labels-idx1-ubyte.gz") as f:
        f.read(8)
        labels = f.read()
    by_digit = {d: [] for d in range(10)}
    for i in range(n):
        by_digit[labels[i]].append(data[i * rows * cols:(i + 1) * rows * cols])
    return by_digit, rows, cols


def glyph(pixels: bytes, rows: int, cols: int, height: int, ink, rng):
    """MNIST digit (white on black) -> RGBA ink glyph cropped and scaled to `height`."""
    g = Image.frombytes("L", (cols, rows), pixels)
    box = g.getbbox() or (0, 0, cols, rows)
    g = g.crop(box)
    w = max(4, round(g.width * height / g.height))
    g = g.resize((w, height), Image.LANCZOS).rotate(rng.uniform(-6, 6), expand=True, fillcolor=0)
    rgba = Image.new("RGBA", g.size, ink + (0,))
    rgba.putalpha(g)
    return rgba


def write_text(page, text, x, y, by_digit, rows, cols, rng, ink, height=46):
    """Writes `text` (digits, '/', ' ', '-') at (x, y=top). Returns the x after the last stroke."""
    d = ImageDraw.Draw(page)
    for ch in text:
        if ch.isdigit():
            gl = glyph(rng.choice(by_digit[int(ch)]), rows, cols, int(height * rng.uniform(0.9, 1.08)), ink, rng)
            page.alpha_composite(gl, (int(x), int(y + rng.uniform(-3, 3))))
            x += gl.width + rng.uniform(1, 5)
        elif ch == "/":
            x0, y0 = x + 4, y + height + rng.uniform(-2, 2)
            d.line([(x0, y0), (x0 + 18 + rng.uniform(-3, 3), y - 2 + rng.uniform(-3, 3))], fill=ink + (255,), width=4)
            x += 26
        elif ch == " ":
            x += 22 + rng.uniform(0, 8)
        elif ch == "-":
            d.line([(x + 2, y + height / 2), (x + 20, y + height / 2 + rng.uniform(-2, 2))], fill=ink + (255,), width=4)
            x += 26
    return x


def main():
    folder = Path(sys.argv[1])
    by_digit, rows, cols = load_mnist(folder)
    manifest = __import__("json").loads((HERE / "out" / "manifest.json").read_text(encoding="utf-8"))
    inks = [(27, 47, 138), (29, 29, 29), (36, 64, 143), (15, 61, 122)]
    for i, s in enumerate(manifest["students"]):
        rng = random.Random(f"mnist-{s['id']}")
        page = Image.open(RAW / f"{s['id']}.png").convert("RGBA")
        ink = inks[i % len(inks)]
        for a in s["answers"]:
            y = 280 + (a["q"] - 1) * 140 - 6
            x = 650 + rng.uniform(-15, 25)
            if a.get("crossedOut"):
                x_end = write_text(page, a["crossedOut"], x, y, by_digit, rows, cols, rng, ink)
                ImageDraw.Draw(page).line([(x - 6, y + 28), (x_end + 6, y + 22 + rng.uniform(-4, 4))], fill=ink + (255,), width=4)
                x = x_end + 40
            if a["written"]:
                write_text(page, a["written"], x, y, by_digit, rows, cols, rng, ink)
        page.convert("RGB").save(OUT_RAW / f"{s['id']}.png")
    print(f"wrote {len(manifest['students'])} sheets to {OUT_RAW}")


if __name__ == "__main__":
    main()
