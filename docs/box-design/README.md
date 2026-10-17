# Box design drawings

Source for the "Chota Box Designs" page (https://claude.ai/artifact/GhhArcB5XuyjeBEBTQW8dC): Fig 1, the counter-top box with lids that open, and Fig 2, the wall plate. Plain Node scripts that draw isometric SVG; no dependencies. The plan itself is in [`../box.md`](../box.md).

```bash
node docs/box-design/build-page.mjs   # → index.html, the page to publish
node docs/box-design/cutlist-md.mjs   # → cutlist.md, the cut list as text (for reviewers)
docs/box-design/shot.sh box-open 1300 # screenshot one SVG, dark + light (headless Chrome)
docs/box-design/pageshot.sh           # screenshot the whole page at 1500 and 400 wide
```

- `box.mjs`: Fig 1. `renderBox({ lid, flap, plid, xray })` returns `{ svg, callouts }`. `S` holds every size, so one real measurement (the printer is `S.printer`: `pw`, `pd`, `ph`) redraws the box and the cut list (`cutList()`, `hardware`).
- `wall.mjs`: Fig 2. `renderWall({ cover, printerLid })`; printer sizes in `PRINTER` at the top.
- `common.mjs`: the iso projection, `frame()`, `callout()`, `dim()`. `figure.css`: every colour, light and dark.
- `build-page.mjs` inlines the three modules into `index.html` and wires the lid buttons; `review-notes.html` is the "what the reviews changed" section it injects.
- `build-box.mjs`, `build-wall.mjs` write the SVGs that `shot.sh` renders.
- `RULES.md`: drawing rules for an agent working here. `BRIEF-wall.md`: the brief Fig 2 was drawn from.

Generated files (`index.html`, `*.svg`, `shots/`) are gitignored.

## Open

- **Measure the MUNBYN.** The printer is drawn from a generic 80 mm printer's listing (140×180×125 mm); its buttons and cover release are guesses. The 10.1" screen module (235×161) and the slim drivers (70×30×15) are assumed too.
- The plug-pack is 81 mm tall and may not fit under the deck; run a one-hour heat test; cut to the measured ply thickness.
- Wall figure: the clock shows an invented quote, its right-hand leaders cross the paper, and dark mode is dim.
- Box figure: the opened-height dimension and the left-end joint lines are busy; the lid briefly overlaps deck parts at 60–75° during the animation.
