// Builds index.html: both figures render at runtime (lids open), prerendered for first paint.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { renderBox, cutList, hardware, W, D, H } from './box.mjs';
const DIR = new URL('.', import.meta.url).pathname;
const rd = (f) => readFileSync(DIR + f, 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const hasWall = existsSync(DIR + 'wall.mjs') && !process.env.NOWALL;
const renderWall = hasWall ? (await import('./wall.mjs')).renderWall : null;
const notes = existsSync(DIR + 'review-notes.html') ? rd('review-notes.html') : '';

// Each module becomes an IIFE, so their top-level names can't collide.
const bundle = (file, name, deps) => {
	let src = rd(file).replace(/^import .*$/gm, '');
	const names = [...src.matchAll(/^export (?:function|const|let) (\w+)/gm)].map((m) => m[1]);
	src = src.replace(/^export /gm, '');
	return `const ${name} = (() => { ${deps ? `const { ${deps} } = Common;` : ''}\n${src}\nreturn { ${names.join(', ')} }; })();`;
};
const common = bundle('common.mjs', 'Common');
const box = bundle('box.mjs', 'Box', 'kernel, frame, callout, svgOpen, dim');
const wall = hasWall ? bundle('wall.mjs', 'Wall', 'kernel, frame, callout, svgOpen, dim') : '';

const BOX0 = { lid: 110, flap: 0, plid: 0, xray: false };
const WALL0 = { cover: true, printerLid: 0 };
const legend = (list) =>
	list
		.map((c) => `<li value="${c.n}"><b>${esc(c.name)}</b> <span>${esc(c.fact)}</span></li>`)
		.join('');
const box0 = renderBox(BOX0),
	wall0 = hasWall ? renderWall(WALL0) : null;

const cutRows = cutList()
	.map(
		(c) =>
			`<tr><th>${esc(c.part)}</th><td class="n">${c.qty}</td><td class="n">${c.size.join(' × ')}</td><td>${esc(c.mat)}</td><td>${esc(c.note ?? '')}</td></tr>`
	)
	.join('');
const pieces = cutList().reduce((n, c) => n + c.qty, 0);

const page = `<title>Chota Box Designs</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
${rd('figure.css')}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--ink-hi);
  font: 15px/1.55 "IBM Plex Sans", system-ui, sans-serif;
  padding-block: 20px 48px;
  padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px));
}
main { max-width: 1150px; margin: 0 auto; }
h1 { font-size: 15px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); margin: 0 0 6px; }
.lead { font-size: 18px; max-width: 66ch; margin: 0 0 16px; text-wrap: pretty; }
h2 { font-size: 17px; font-weight: 600; margin: 36px 0 8px; text-wrap: balance; }
p, li { max-width: 72ch; }
.card { margin: 0; background: var(--panel); border: 1px solid var(--edge); border-radius: 12px; padding: 12px; container-type: inline-size; min-width: 0; }
.bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 2px 4px 6px; }
.plate { font: 600 12px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .1em; text-transform: uppercase; color: var(--ink); margin-right: auto; }
button.t { font: 600 13px "IBM Plex Sans", system-ui, sans-serif; color: var(--ink-hi); background: var(--bg); border: 1px solid var(--edge); border-radius: 999px; padding: 6px 14px; cursor: pointer; }
button.t[aria-pressed="true"] { background: var(--ink-hi); color: var(--panel); border-color: var(--ink-hi); }
button.t:focus-visible { outline: 2px solid var(--live); outline-offset: 2px; }
.legend { display: none; margin: 8px 0 0; padding-left: 28px; font-size: 13px; color: var(--ink-hi); }
.legend span { color: var(--ink); font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; }
@container (max-width: 760px) {
  svg.iso .lbl, svg.iso .lbl-fact { display: none; }
  svg.iso .num { font-size: 34px; } svg.iso .num-bg { r: 27; }
  svg.iso .dim-text { font-size: 30px; }
  .legend { display: block; }
}
ul.tight { padding-left: 20px; margin: 6px 0; } ul.tight li { margin: 4px 0; }
.table-wrap { overflow-x: auto; background: var(--panel); border: 1px solid var(--edge); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; vertical-align: top; padding: 7px 10px; border-bottom: 1px solid var(--edge); }
thead th { font: 600 12px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); white-space: nowrap; }
tbody th { font-weight: 600; white-space: nowrap; }
td.n { font-family: "IBM Plex Mono", ui-monospace, monospace; white-space: nowrap; }
tr:last-child th, tr:last-child td { border-bottom: 0; }
.note { font-size: 13px; color: var(--ink); margin-top: 8px; }
.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; } .two > * { min-width: 0; }
@media (max-width: 760px) { .two { grid-template-columns: 1fr; } }
.box-note { background: var(--panel); border: 1px solid var(--edge); border-radius: 12px; padding: 12px 16px; }
.box-note h3 { margin: 0 0 4px; font-size: 15px; }
</style>
<main>
<h1>Chota box · v4</h1>
<p class="lead">The box shrinks to <b>${W} × ${D} × ${H} mm</b>, down from about 490 × 300 × 205. One screen: the 10.1" in the lid, 20 mm thin. The deck has dials, PRINT and a needle meter, and a camera with a brass shutter sits on the front rim. Both speakers sit in the front wall in sealed boxes, where they get real air. Paper rises through a slot in the printer's own lid; lift that lid to change the roll.</p>

<figure class="card" id="fig-box">
  <div class="bar"><span class="plate">Fig 1 · The box</span>
    <button class="t" data-fig="box" data-act="lid" aria-pressed="true">Lid open</button>
    <button class="t" data-fig="box" data-act="printer" aria-pressed="false">Printer open</button>
    <button class="t" data-fig="box" data-act="xray" aria-pressed="false">See inside</button>
  </div>
  <div class="art">${box0.svg}</div>
  <ol class="legend">${legend(box0.callouts)}</ol>
</figure>

<div class="two" style="margin-top:16px">
<div class="box-note">
<h3>Still to measure</h3>
<ul class="tight">
<li><b>The printer</b> (MUNBYN ITPP098P, kept: it works, and smaller 80 mm printers save only 10–15 mm). Drawn at Newegg's 140 × 180 × 125; Amazon's 164 × 286 × 160 is the carton. Measure width, depth, height, where the paper leaves (distance back from the front edge) and how far its cover swings; one measurement redraws the box and cut list. Your 80 × 80 mm rolls are near its roll-bay limit.</li>
<li><b>The 10.1" screen's thickness</b>, and its 235 × 161 outline against Waveshare's drawing. It sets the lid depth.</li>
<li><b>The lid screen's outline.</b> Waveshare's sibling 10.1" panel is 228.6 × 143.0 × 2.6 mm, so it should fit the 244 × 170 face; confirm on the (C) drawing before cutting the rebate.</li>
<li><b>The drivers.</b> Drawn as 2" full-range (57 mm frame, 30 mm deep). Pick a model and I'll size the holes and boxes to it.</li>
</ul>
</div>
<div class="box-note">
<h3>Changed from box.md</h3>
<ul class="tight">
<li><b>The paper slot is cut into the printer's lid</b>, right over the paper exit, with a chamfered mouth and an angled guide under it so the curl can't fold back. To change the roll: lift that lid ("Printer open"), flip the printer's cover, drop in the roll. The printer's cover hinges at its back, so a fixed strip above the exit would block it; two dowels seat the lid so the slot always lines up.</li>
<li><b>One rim height.</b> Every wall stops at 140 mm and both lids are 20 mm deep, so the box closes flat. The deck sits 38 mm under the lid.</li>
<li><b>Mic and a TALK button on the front</b>, so voice works with the lid shut. Sound goes out through the mic board, which then hears and cancels its own echo.</li>
<li><b>One screen (v4).</b> The deck screen is gone: the dials are only reachable with the lid open, and then the lid screen faces you, so turning WHO or WHAT shows there. That frees the Pi's second camera/display port for a Pi Camera Module 3 and means one kiosk window instead of two. A needle meter takes its place on the deck.</li>
<li><b>Audio runs through the mic board (v4).</b> Pi → USB → XVF3800 → its 3.5 mm out → amp → speakers. The board hears exactly what it plays, so it can cancel its own voice; a separate sound card on the Pi would break that.</li>
<li><b>Speakers moved from the lid to the front wall</b> (v3). In the lid they had 15 mm of depth and half a litre between them; in the box each 2" driver gets its own sealed 0.2 L box below the deck. Better voice, listenable music, and only the screen ribbon crosses the hinge.</li>
</ul>
</div>
</div>

${
	hasWall
		? `<figure style="margin-top:28px" class="card" id="fig-wall">
  <div class="bar"><span class="plate">Fig 2 · Wall plate</span>
    <button class="t" data-fig="wall" data-act="cover" aria-pressed="true">Cover on</button>
    <button class="t" data-fig="wall" data-act="printer" aria-pressed="false">Printer open</button>
  </div>
  <div class="art">${wall0.svg}</div>
  <ol class="legend">${legend(wall0.callouts)}</ol>
</figure>`
		: ''
}

<h2>Exposed on a plate, or inside a box?</h2>
<p><b>Plate on a wall, boards under clear acrylic.</b> Exposed boards are the look you want and the easiest to change. On a kitchen counter they get splashes, crumbs and small hands, and the Pi's fan pulls dust across them. On a wall at adult height most of that goes away, and a 3 mm acrylic cover on standoffs keeps the look while stopping fingers and dust. The box wins only if it has to be portable, or the kids reach the wall.</p>
<p>I'd build the plate first. It's an afternoon's work, it proves the screen, the sound and the printer, and every part moves into the box later if you still want one.</p>

<h2>Box cut list</h2>
<p>${pieces} pieces from about half a sheet of 12 mm birch ply, a 9 mm offcut, 6 mm ply for the lid skins, and one length of hardwood for the hinge strip and lid frames. Sizes are length × width × thickness in mm, worked out from the same numbers as the drawing.</p>
<div class="table-wrap"><table>
<thead><tr><th>Part</th><th>Qty</th><th>Size</th><th>Material</th><th>Note</th></tr></thead>
<tbody>${cutRows}</tbody>
</table></div>
<p class="note"><b>Hardware:</b> ${hardware.map(esc).join('; ')}.</p>
${notes}
</main>
<script>
${common}
${box}
${wall}
(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const figs = {
    box: { render: Box.renderBox, state: ${JSON.stringify(BOX0)} },
    ${hasWall ? `wall: { render: Wall.renderWall, state: ${JSON.stringify(WALL0)} },` : ''}
  };
  const draw = (name) => {
    const f = figs[name], el = document.getElementById("fig-" + name);
    const out = f.render(f.state);
    el.querySelector(".art").innerHTML = out.svg;
    el.querySelector(".legend").innerHTML = out.callouts.map((c) => '<li value="' + c.n + '"><b>' + c.name + '</b> <span>' + c.fact + '</span></li>').join("");
  };
  const ease = (x) => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  const tween = (name, key, to, ms = 650) => new Promise((done) => {
    const f = figs[name], from = f.state[key];
    if (reduce || from === to) { f.state[key] = to; draw(name); return done(); }
    const t0 = performance.now();
    const step = (now) => {
      const x = Math.min(1, (now - t0) / ms);
      f.state[key] = from + (to - from) * ease(x);
      draw(name);
      x < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  });
  let busy = false;
  const acts = {
    box: {
      lid: (on) => tween("box", "lid", on ? 110 : 0, 900),
      printer: async (on) => { if (on) { await tween("box", "flap", 105, 700); await tween("box", "plid", 95, 600); } else { await tween("box", "plid", 0, 500); await tween("box", "flap", 0, 700); } },
      xray: (on) => { figs.box.state.xray = on; draw("box"); },
    },
    wall: {
      cover: (on) => { figs.wall.state.cover = on; draw("wall"); },
      printer: (on) => tween("wall", "printerLid", on ? 1 : 0, 700),
    },
  };
  document.querySelectorAll("button.t").forEach((b) => {
    b.addEventListener("click", async () => {
      if (busy) return; busy = true;
      const next = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(next));
      try { await acts[b.dataset.fig][b.dataset.act](next); } finally { busy = false; }
    });
  });
})();
</script>
`;
writeFileSync(DIR + 'index.html', page);
console.log('wrote index.html', page.length, 'bytes; wall:', hasWall, 'notes:', !!notes);
