---
name: print-brief
description: Lay out and render a double-sided A4 brief for the home laser printer (black and white, one sheet, both sides) — a person's day, a kid's zine, any on-demand paper print from chota. Use when asked to make, design or change a printed A4 brief, newspaper or zine, or the HTML behind one. Not for the 80 mm thermal receipts (that's src/lib/server/print/).
---

# Print brief

One A4 sheet, printed on both sides by the Brother laser through CUPS: a dense, quiet page in the style of an engineering handbook. Each side is a fixed page; nothing flows from one side to the other.

Start from `assets/template.html` (a parent's "day ahead", placeholder names). Copy it, replace the content, keep the CSS.

## Rules

- **Black and white only.** No colour, no grey (`check.py` fails on both). Tell things apart by hatching, dots, dashes or outline (`.hatch`, `.dots`, `stroke-dasharray`). A laser turns grey into dots, and meaning carried by colour is lost.
- **Margins 12 mm.** Home lasers leave 4–5 mm unprinted at every edge. Nothing bleeds; the side tab sits 3 mm in.
- **Type no smaller than 7.5 pt** (8 pt for kids' editions). Body 9 pt. Cut words before shrinking type.
- **Lines at least 0.25 mm** in drawings; finer ones print faint or vanish.
- **Fonts:** IBM Plex Serif (prose), Barlow Condensed (heads, labels), IBM Plex Mono (tables, cards). All OFL, from Google Fonts. Use static families only: Chromium embeds a variable font as unnamed outlines, and `check.py` reports it as missing.
- **Placeholders only** in anything committed: Parent1, Kid1. Real names come from `chota.config.ts` at run time.

## A side, top to bottom

| Block               | What                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------- |
| Running head        | document code (bold), title, the day; 1.5 pt rule                                     |
| Opener              | "Section N · Name" and a big title, centred caps                                      |
| Numbered paragraphs | `N.1 SUMMARY.` bold run-in heads, 2–4 lines each; underline the one line that matters |
| Figures             | inline SVG in mm-ish units, with a caption line and a code (`CAL-01`) on the right    |
| Lower band          | a table on the left; a NOTE or CAUTION box and a checklist card on the right (62 mm)  |
| Footer              | rule, title, date, "Page 1 of 2"                                                      |

Front: today (summary, a timeline, weather, getting there, home, school, calendar, checklist). Back: reading (mail that needs you, feed picks in two columns, a chart, one thing to know, books, a quote, a puzzle). Answers to a puzzle go on the next day's sheet.

## Render and check

```sh
.agents/skills/print-brief/scripts/render.sh path/brief.html     # → brief.pdf, brief.png, fit
uv run --with pymupdf python .agents/skills/print-brief/scripts/check.py path/brief.pdf
```

- `render.sh` uses plain headless Chromium (`/usr/bin/chromium` on the Pi; agent-browser's Chrome for Testing on the Mac). Not `agent-browser pdf`: it ignores `@page` and writes US Letter.
- The fit line says how much room each side has left above its footer. Aim for 4–10 mm on a real brief (the template leaves room on purpose). `OVERFLOW` exits 3: the side is clipped. Cut a line (about 4 mm) or a table row (about 5 mm).
- `check.py` fails on a wrong page count, a page that isn't A4, anything in colour, or a fallen-back font. Look at `brief.png` before printing.

## Printing

```sh
lp -d brother -o sides=two-sided-long-edge -o media=A4 brief.pdf
```

CUPS 2.4 on the Pi, driverless (IPP Everywhere) to the Brother HL-L2350DW; set-up in `docs/printers.md` §A4. The queue's default is already two-sided A4, so a bare `lp brief.pdf` works too. A print uses paper and toner: only when asked.

## Editions (planned)

The same layout with a different page plan per person, picked from config, printed on demand when someone asks chota in chat (chota may ask one or two questions first):

- **A parent's day ahead:** this template; mail, calendar, feeds.
- **A kid's zine:** their day in brief, science bits, a two-line book note, a fact, a short poem or haiku, a maths puzzle, maybe a short STEM story from `curios`, and one drawing in line art (a "thing explainer" or a comic panel). Bigger type, more white space.

Keep one stylesheet; when the second edition is built, move the CSS into `assets/base.css` and give each edition its own page plan.
