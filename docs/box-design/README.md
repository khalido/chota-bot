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
- `parts.mjs`: the equipment list (have / buy / later, AUD) for the Equipment tab; `hardware` in `box.mjs` is the box fittings.
- `build-box.mjs`, `build-wall.mjs` write the SVGs that `shot.sh` renders.
- `RULES.md`: drawing rules for an agent working here. `BRIEF-wall.md`: the brief Fig 2 was drawn from.

Generated files (`index.html`, `*.svg`, `shots/`) are gitignored.

## Wiring planner

A bench page for wiring parts to the Pi 5 header and the Pico 2 W: pins drawn as they sit on the board, a wire per part pin, checks, and a ✓ per wire (saved in the browser).

```bash
node docs/box-design/build-wiring.mjs   # → wiring.html, one self-contained page
node docs/box-design/build-wiring.mjs some-data.mjs   # same page from another data file (to test the checks)
```

- `wiring.mjs`: the data. Both pinouts, the limits the checks use (each with a source and a note on how sure it is), and every part with its pins. Pins box.md settles are `decided`; every other pin is `proposed` with a one-line reason. Change a pin here and the drawing, tables and checks follow.
- `wiring-client.js` draws and checks; `wiring.css` has the page styles (pin, bus and wire colours, light and dark). `build-wiring.mjs` inlines both with `figure.css`.
- Checks (computed, never typed in): two wires on one pin, a bus pin used as plain GPIO while its bus is in use (Pi only), a signal on a power pin or the HAT ID pins, 5 V and 3.3 V rail, USB and buck current against their limits, a 5 V part driven from a 3.3 V GPIO with no shifter. They cover what the phase filter and the parts list show.
- `wiring.html` is gitignored.

## Open

- **Measure the MUNBYN.** The printer is drawn from a generic 80 mm printer's listing (140×180×125 mm); its buttons and cover release are guesses. The 10.1" screen module (235×161) is assumed too.
- The ND91's frame (103.5 vs 93 mm) and the screen's outline: check against the parts in hand. Run a one-hour heat test; cut to the measured ply thickness.
- Wall figure: the clock shows an invented quote, its right-hand leaders cross the paper, and dark mode is dim.
- Box figure: the opened-height dimension and the left-end joint lines are busy; the lid briefly overlaps deck parts at 60–75° during the animation.
