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

## Wiring tab

The "Wiring" tab of `index.html` is a bench planner: the Pi 5 header and the Pico drawn as they sit on the board, a wire per part pin, a "Whole box" block diagram (Pi 5 ports, USB, ribbons, the 24 V tree, sound chain), checks, and a ✓ per wire. Ticks save to the page's shared db (doc `wiring/ticks`), so ones made on the phone show on the laptop; a local file with no db falls back to localStorage. It is built by `build-page.mjs` with the rest of the page.

```bash
node docs/box-design/test-wiring.mjs   # the checks: real data clean for v1 and all, broken copies trip them
```

- `wiring.mjs`: the data. Both pinouts, the limits the checks use (each with a source and how sure it is), every part with its pins, the `links` between parts and Pi ports, and `piPorts`. Pins box.md settles are `decided`; every other pin is `proposed` with a one-line reason. Change a pin here and the drawing, tables and checks follow. Parts with `view: 'box'` show only in the Whole-box view.
- `wiring-checks.mjs`: the checks as plain functions (shared by the page and the test). `wiring-client.js` draws everything; `wiring.css` is scoped under `#wiring`.
- Checks (computed, never typed in): two wires on one pin, a bus pin used as plain GPIO while its bus is in use (Pi only), a signal on a power or HAT ID pin, 5 V and 3.3 V rails, USB, the buck and the 24 V brick against their limits, a 5 V part driven from a 3.3 V GPIO with no shifter, a cable that goes nowhere. They cover what the phase filter and the parts list show.
- The Whole-box view's port positions on the Pi 5 are from photos; only the fan connector's place is in Raspberry Pi's docs.

## Open

- **Measure the MUNBYN.** The printer is drawn from a generic 80 mm printer's listing (140×180×125 mm); its buttons and cover release are guesses. The 10.1" screen module (235×161) is assumed too.
- The ND91's frame (103.5 vs 93 mm) and the screen's outline: check against the parts in hand. Run a one-hour heat test; cut to the measured ply thickness.
- Wall figure: the clock shows an invented quote, its right-hand leaders cross the paper, and dark mode is dim.
- Box figure: the opened-height dimension and the left-end joint lines are busy; the lid briefly overlaps deck parts at 60–75° during the animation.
