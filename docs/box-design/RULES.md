# Shared rules for both drawings

Folder: `docs/box-design/` in chota-bot (call it DIR). A drawing agent writes only inside DIR.

## Tools you must use

- `DIR/common.mjs`: `kernel(OX, OY, scale)` (iso projection; use scale 0.9 to start), `frame(K, W, Dp)` (object coordinates), `callout(...)`, `svgOpen(viewBox, aria)`. Read it fully first; do not edit it. If you need a helper, write it in your own build file.
- `DIR/figure.css`: the only styles. Use its classes: material faces `face wood|brass|pcb|dark|plain|paper` with tone suffix `t|f|s` (box() adds these), `glass`, `screen-on`, `screen-ink`, `screen-text`, `halo`, `accent`, `accent-hi`, `led`, `led on`, `detail`, `hair`, `cable`, `ffc`, `cut`, `cut-fill`, `paper-ink`, `face-text`, `ghost`, `vent`, `chain`, `acrylic`. **No hex colours, rgb(), or inline fill/stroke colours in the SVG.** You may set stroke-width, opacity, font-size inline. If a class you need is missing, say so in your report; don't add CSS.
- Render with `DIR/shot.sh <name> 1300` and `DIR/shot.sh <name> 420` (Bash tool with `dangerouslyDisableSandbox: true`; it uses headless Chrome directly). Then Read the PNGs in `DIR/shots/` (dark and light) and look at them critically.

## Coordinates

`frame(K, W, Dp)` gives object coordinates: u = mm from the object's left end, w = mm from its back, z = mm up. The object's front face lands lower-right on screen, its left end lower-left, its top up. 1 world unit = 1 mm. Planes: `BTOP(u,w,z)` (local x = rightward, local y = toward the front), `BFRONT(u,z)` (front face, local y down), `BLEFT(w,z)` (left end, local x runs back to front), `PLANE_AT_W`, `PLANE_AT_U`, `BTILT(u,w,z,angle)` (face leaning back, origin at its top-left corner). `bbox(u,w,z,du,dw,h,cls)` and `bcyl(u,w,z,r,h,cls)`, `Pt(u,w,z)` → screen point. Draw circles, rects, text inside a plane group (`<g transform="${F.BTOP(...)}">…</g>`); never hand-compute skewed polygons. Round parts lying on a top face (knobs, buttons, standoffs, drivers) are `bcyl`.

**Painter's order is the only depth sort**: paint right-and-back first (larger u, smaller w), low z before high z. bbox draws an opaque top over its whole footprint, so thin trim, rims and ledges against a wall are flat rects on a plane, not boxes. A ribbon or cable is a path between two screen points from `Pt()`; route it along structure, not across faces it would pass through.

## Look

Iso-figure / iso-glow: fine hairlines (non-scaling stroke is in the CSS), opaque fills, light from the upper left (top lightest, left end mid, front darkest; the tone classes do this). One accent family only on what is live: lit screen content (`screen-on` + `screen-text`, optional `halo` behind), the PRINT button (`accent`), LEDs that are on. Everything else monochrome materials. Texture from repetition (grille holes, vent slots, fins, header pins), not noise. Detail every part a little: screw dots at plate corners (r 1.5–2), header pin rows, connector shells, standoff hex hints. No logos or brand marks on parts. All ids prefixed with your figure's prefix.

## Callouts

Use `callout(n, Pt(...), [lx, ly], name, fact, side)`. Put the dot ON the part. Labels sit in the margins (left column side "l", right column side "r") so leaders never cross a label and rarely cross each other; leaders may cross the drawing. Name = part name; fact = one short fact (≤ 34 chars), e.g. "Pi 5 4GB" / "on brass M2.5 standoffs". Labels must not overlap each other or the drawing's important parts. Keep ~70 viewBox units between label rows. Sort callout numbers clockwise from top-left.

## Deliverables (in DIR)

1. `build-<name>.mjs` → writes `<name>.svg` (just the `<svg>…</svg>`, viewBox about 1300 × 950, width/height not set) and `<name>-callouts.json` (`[{n, name, fact}]`).
2. Screenshots in `DIR/shots/`, looked at by you.
3. A feature table in your final report: part · where (u,w,z mm) · source (brief line or box.md section) · drawn y/n. Plus anything you guessed, and anything that looks wrong you couldn't fix.
