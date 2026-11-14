"""Turn rendered worksheets (out/raw/*.png) into phone-photo-like JPEGs (public/samples/*.jpg).

Adds a desk background, a slight rotation and perspective, uneven lighting, sensor noise
and mild blur, then saves a 1100 px wide JPEG. Deterministic per file name.
Usage: uv run --with pillow python tools/samples/photo.py
"""
import random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

HERE = Path(__file__).resolve().parent
RAW = HERE / "out" / "raw"
OUT = HERE.parent.parent / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)


def find_coeffs(src, dst):
    import numpy as np  # noqa: F401  (only used if available)


def perspective(img, rng):
    w, h = img.size
    d = lambda: rng.uniform(-0.018, 0.018)
    # destination corners jittered; PIL wants coefficients mapping output->input
    src = [(0, 0), (w, 0), (w, h), (0, h)]
    dst = [(w * d(), h * d()), (w * (1 + d()), h * d()), (w * (1 + d()), h * (1 + d())), (w * d(), h * (1 + d()))]
    # solve 8 coefficients with a small Gaussian elimination (no numpy needed)
    A, B = [], []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); B.append(u)
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y]); B.append(v)
    n = 8
    M = [row[:] + [b] for row, b in zip(A, B)]
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        for r in range(n):
            if r != i:
                f = M[r][i] / M[i][i]
                M[r] = [a - f * b for a, b in zip(M[r], M[i])]
    coeffs = [M[i][n] / M[i][i] for i in range(n)]
    return img.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC, fillcolor=(0, 0, 0, 0))


def process(path: Path):
    rng = random.Random(path.stem)
    page = Image.open(path).convert("RGBA")
    W, H = 1400, 1900
    desk = Image.new("RGBA", (W, H), (int(rng.uniform(95, 140)), int(rng.uniform(80, 110)), int(rng.uniform(60, 85)), 255))
    dd = ImageDraw.Draw(desk)
    for _ in range(1400):  # wood-ish streaks
        y = rng.uniform(0, H)
        c = rng.randint(-14, 14)
        base = desk.getpixel((0, 0))
        dd.line([(0, y), (W, y + rng.uniform(-30, 30))], fill=(base[0] + c, base[1] + c, base[2] + c, 255), width=1)
    page = perspective(page, rng).rotate(rng.uniform(-2.6, 2.6), resample=Image.BICUBIC, expand=True)
    shadow = Image.new("RGBA", page.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 110), mask=page.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    ox, oy = (W - page.width) // 2 + rng.randint(-25, 25), (H - page.height) // 2 + rng.randint(-25, 25)
    desk.alpha_composite(shadow, (ox + 10, oy + 14))
    desk.alpha_composite(page, (ox, oy))
    img = desk.convert("RGB")
    # uneven lighting: radial-ish gradient
    light = Image.new("L", (W, H), 0)
    ld = ImageDraw.Draw(light)
    cx, cy = rng.uniform(0.2, 0.8) * W, rng.uniform(0.1, 0.5) * H
    for r in range(0, 1800, 30):
        ld.ellipse([cx - r, cy - r, cx + r, cy + r], outline=int(min(255, r / 1800 * 120)), width=30)
    light = light.filter(ImageFilter.GaussianBlur(60))
    dark = ImageEnhance.Brightness(img).enhance(0.72)
    img = Image.composite(dark, img, light)
    img = ImageEnhance.Color(img).enhance(rng.uniform(0.9, 1.1))
    # noise + blur
    noise = Image.effect_noise((W, H), rng.uniform(10, 18)).convert("RGB")
    img = Image.blend(img, noise, 0.05)
    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 0.9)))
    img = img.resize((1100, int(1100 * H / W)), Image.LANCZOS)
    img.save(OUT / f"{path.stem}.jpg", "JPEG", quality=82, optimize=True)


if __name__ == "__main__":
    files = sorted(RAW.glob("*.png"))
    for f in files:
        process(f)
    print(f"wrote {len(files)} photos to {OUT}")
