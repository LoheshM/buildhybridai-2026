"""Renders the v2 sample classes (tools/samples/out/<class>/manifest.json) to phone-photo-like JPEGs.

  raw PNGs:  tools/samples/out/<class>/raw/<id>.png   (headless Chrome, sheet2.html)
  photos:    public/samples/<class>/<id>.jpg          (photo.py: desk, tilt, light, noise)
Then writes public/samples/<class>/manifest.json with each photo's SHA-256 (the network guard's allowlist).
Usage: uv run --with pillow python -I tools/samples/render2.py [maths science english] [--only m01,m02]
"""
import base64
import hashlib
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
APP = HERE.parent.parent
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
FONTS = [("Kalam", 40), ("Caveat", 50), ("Patrick Hand", 42), ("Gochi Hand", 42), ("Indie Flower", 40), ("Shadows Into Light", 44), ("Reenie Beanie", 52)]
INKS = ["#1b2f8a", "#1d1d1d", "#24408f", "#3b3b3b", "#0f3d7a"]
LAYOUT = {  # per class: question kinds and sizes so every sheet fits one A4 page
    "maths": {"kinds": lambda q: "inline", "qsize": 30, "gap": 34, "scale": 1.0},
    "science": {"kinds": lambda q: "long" if q["q"] in (6, 7) else "line", "qsize": 23, "gap": 14, "scale": 0.92, "lines": 2},
    "english": {"kinds": lambda q: "long" if q["q"] in (6, 7) else "line", "qsize": 23, "gap": 10, "scale": 0.86, "lines": {6: 2, 7: 6}},
}


def main():
    args = [a for a in sys.argv[1:] if a in ("maths", "science", "english")]
    only = sys.argv[sys.argv.index("--only") + 1].split(",") if "--only" in sys.argv else None
    for cls in args or ["maths", "science", "english"]:
        m = json.loads((HERE / "out" / cls / "manifest.json").read_text(encoding="utf8"))
        raw = HERE / "out" / cls / "raw"
        raw.mkdir(parents=True, exist_ok=True)
        lay = LAYOUT[cls]
        for i, s in enumerate(m["students"]):
            if only and s["id"] not in only:
                continue
            font, size = FONTS[i % len(FONTS)]
            lines = lay.get("lines", 3)
            data = {
                "seed": 700 + i * 41, "title": m["quiz"]["title"], "className": m["quiz"]["className"], "instructions": m["quiz"].get("instructions", ""),
                "extract": m["quiz"].get("extract"), "name": s["name"].split(" ")[0] + " " + s["name"].split(" ")[1][0] + ".",
                "font": font, "size": round(size * lay["scale"]), "ink": INKS[i % len(INKS)], "stacked": cls == "maths" and i % 5 == 3,
                "qsize": lay["qsize"], "gap": lay["gap"],
                "questions": [{"q": q["q"], "prompt": q["prompt"], "kind": lay["kinds"](q), "lines": lines.get(q["q"], 2) if isinstance(lines, dict) else lines} for q in m["quiz"]["questions"]],
                "answers": [{"written": a["written"], "crossedOut": a.get("crossedOut", "")} for a in s["answers"]],
            }
            h = base64.b64encode(json.dumps(data, ensure_ascii=False).encode("utf8")).decode()
            out = raw / f"{s['id']}.png"
            subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", f"--screenshot={out}",
                            "--window-size=1240,1754", "--virtual-time-budget=10000", (HERE / "sheet2.html").as_uri() + "#" + h], check=True, capture_output=True)
            print("rendered", cls, s["id"], font, flush=True)
        dest = APP / "public" / "samples" / cls
        subprocess.run(["uv", "run", "-q", "--with", "pillow", "python", "-I", str(HERE / "photo.py"), str(raw), str(dest)], check=True)
        if only:
            continue  # a partial render is for looking at; the manifest is written by a full run
        for s in m["students"]:
            s["sha256"] = hashlib.sha256((dest / f"{s['id']}.jpg").read_bytes()).hexdigest()
        (dest / "manifest.json").write_text(json.dumps(m, indent=1, ensure_ascii=False), encoding="utf8")
        print(cls, "manifest written with hashes")


if __name__ == "__main__":
    main()
