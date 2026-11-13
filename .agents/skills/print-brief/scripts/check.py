"""Check a rendered print brief before it goes to the laser printer.

    uv run --with pymupdf python check.py brief.pdf [--sides 2]

Fails (exit 1) when:
- the page count isn't the number of sides (one A4 sheet = 2),
- a page isn't A4,
- anything is in colour or grey (the printer is black and white: colour and
  grey turn into dots, and meaning carried by colour is lost),
- a font fell back to a system face (the web fonts didn't load).
Warns about raster images, which print soft and can be large.
"""

import argparse
import sys

import pymupdf

A4 = (595.3, 841.9)  # points
FONTS = ("IBMPlexSerif", "BarlowCondensed", "IBMPlexMono")


def black_or_white(c) -> bool:
    """Pure black or white only: a laser turns any grey into dots."""
    if c is None:
        return True
    vals = [c] if isinstance(c, (int, float)) else list(c)
    if len(vals) == 4:  # CMYK: no C, M or Y, and K fully on or off
        return max(vals[:3]) < 0.02 and (vals[3] < 0.02 or vals[3] > 0.98)
    return all(v < 0.02 or v > 0.98 for v in vals) and max(vals) - min(vals) < 0.02


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("--sides", type=int, default=2)
    a = ap.parse_args()

    doc = pymupdf.open(a.pdf)
    problems: list[str] = []
    warnings: list[str] = []

    if doc.page_count != a.sides:
        problems.append(f"{doc.page_count} pages, expected {a.sides}")

    fonts: set[str] = set()
    for i, page in enumerate(doc, start=1):
        w, h = page.rect.width, page.rect.height
        if abs(w - A4[0]) > 2 or abs(h - A4[1]) > 2:
            problems.append(f"page {i} is {w:.0f}×{h:.0f} pt, not A4")
        bad = {
            (
                key,
                tuple(d[key]) if isinstance(d.get(key), (list, tuple)) else d.get(key),
            )
            for d in page.get_drawings()
            for key in ("color", "fill")
            if not black_or_white(d.get(key))
        }
        for key, c in sorted(bad, key=str):
            problems.append(f"page {i}: a {key} that isn't black or white: {c}")
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                for span in line["spans"]:
                    c = span["color"]
                    r, g, b = (c >> 16) & 255, (c >> 8) & 255, c & 255
                    if (r, g, b) not in ((0, 0, 0), (255, 255, 255)):
                        problems.append(
                            f"page {i}: text that isn't black or white {span['text'][:30]!r}"
                        )
        for f in page.get_fonts():
            fonts.add(f[3])
        if page.get_images():
            warnings.append(f"page {i}: {len(page.get_images())} raster image(s)")

    names = " ".join(sorted(fonts))
    missing = [f for f in FONTS if f not in names.replace(" ", "")]
    if missing:
        problems.append(
            f"fonts missing (fell back?): {', '.join(missing)}; embedded: {names}"
        )

    for w in warnings:
        print("warning:", w)
    for p in dict.fromkeys(problems):
        print("problem:", p)
    if problems:
        return 1
    print(f"ok: {doc.page_count} A4 sides, black and white only, fonts {names}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
