// Builds index.html: both figures render at runtime (lids open), prerendered for first paint.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { renderBox, cutList, hardware, W, D, H } from './box.mjs';
import { equipment, toBuy } from './parts.mjs';
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
const STATUS = { have: 'have', buy: 'buy', later: 'later' };
const eqRows = [...new Set(equipment.map((e) => e.group))]
	.map(
		(g) =>
			`<tr class="grp"><th colspan="5">${esc(g)}</th></tr>` +
			equipment
				.filter((e) => e.group === g)
				.map(
					(e) =>
						`<tr><th>${esc(e.item)}</th><td class="n">${e.qty}</td><td><span class="st ${e.status}">${STATUS[e.status]}</span></td><td class="n">${e.aud ? `$${e.aud * e.qty}` : ''}</td><td>${esc(e.why)}${e.source ? ` <span class="src">· ${esc(e.source)}</span>` : ''}</td></tr>`
				)
				.join('')
	)
	.join('');
const hwRows = hardware
	.map((h) => `<tr><th>${esc(h.item)}</th><td class="n">${h.qty}</td><td>${esc(h.note)}</td></tr>`)
	.join('');

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
.tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--edge); margin: 8px 0 16px; overflow-x: auto; }
.tabs button { font: 600 14px "IBM Plex Sans", system-ui, sans-serif; color: var(--ink); background: none; border: 0; border-bottom: 2px solid transparent; padding: 8px 12px; cursor: pointer; white-space: nowrap; }
.tabs button[aria-selected="true"] { color: var(--ink-hi); border-bottom-color: var(--ink-hi); }
.tabs button:focus-visible { outline: 2px solid var(--live); outline-offset: -2px; }
tr.grp th { font: 600 12px "IBM Plex Mono", ui-monospace, monospace; letter-spacing: .08em; text-transform: uppercase; color: var(--ink); background: var(--bg); }
.st { font: 600 11px "IBM Plex Mono", ui-monospace, monospace; padding: 1px 7px; border-radius: 999px; border: 1px solid var(--edge); }
.st.buy { background: var(--ink-hi); color: var(--panel); border-color: var(--ink-hi); }
.st.later { color: var(--ink); border-style: dashed; }
.src { color: var(--ink); font-size: 13px; }
</style>
<main>
<h1>Chota box · v7</h1>
<p class="lead">The box is <b>${W} × ${D} × ${H} mm</b>. One screen: the 10.1" in the lid, 20 mm thin. The deck has dials, PRINT and a needle meter, and a camera with a brass shutter sits on the front rim. Two 3.5" speakers fill the front wall, each in its own ~0.7 L sealed chamber under the front of the deck, with bass EQ on the Pi: close to a Nest Audio. The mic, TALK and camera ride on the rim above. Hold TALK and the box goes quiet and listens. Paper rises through a slot in the printer's own lid; lift that lid to change the roll.</p>

<div class="tabs" role="tablist">
<button role="tab" id="tab-design" aria-controls="design" aria-selected="true">Design</button>
<button role="tab" id="tab-equipment" aria-controls="equipment" aria-selected="false">Equipment</button>
<button role="tab" id="tab-build" aria-controls="build" aria-selected="false">Box build</button>
</div>

<section id="design" role="tabpanel" aria-labelledby="tab-design">
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
<li><b>The ND91's frame.</b> Parts Express lists 85 mm across with a 76.5 mm cut-out; another shop lists 103.5 mm. The drawing uses 85. Check Dayton's PDF before cutting the front wall; a 103.5 mm frame needs the box 10 mm taller again.</li>
</ul>
</div>
<div class="box-note">
<h3>Changed from box.md</h3>
<ul class="tight">
<li><b>The paper slot is cut into the printer's lid</b>, right over the paper exit, with a chamfered mouth and an angled guide under it so the curl can't fold back. To change the roll: lift that lid ("Printer open"), flip the printer's cover, drop in the roll. The printer's cover hinges at its back, so a fixed strip above the exit would block it; two dowels seat the lid so the slot always lines up.</li>
<li><b>One rim height.</b> Every wall stops at ${H - 20} mm and both lids are 20 mm deep, so the box closes flat. The deck sits 38 mm under the lid. v6 added 20 mm of height so a 3.5" driver fits the face under the deck.</li>
<li><b>Mic and a TALK button on the front rim</b>, so voice works with the lid shut.</li>
<li><b>One screen (v4).</b> The deck screen is gone: the dials are only reachable with the lid open, and then the lid screen faces you, so turning WHO or WHAT shows there. That frees the Pi's second camera/display port for a Pi Camera Module 3 and means one kiosk window instead of two. A needle meter takes its place on the deck.</li>
<li><b>ReSpeaker Lite, not the XVF3800 (v5).</b> Two mics, the same XMOS echo cancelling, A$43 instead of A$113. In v1 it only listens: all sound (speech and music) plays through a small USB sound card into the amp, because the Lite tops out at 16 kHz. TALK pauses everything while held, so there's no echo to cancel. The mic sits behind the front rim, above the deck: higher, and away from the speakers.</li>
<li><b>Deck controls moved back (v7, from Gemini's review).</b> The speaker chambers fill the front 90 mm under the deck, so the button, dials, meter, toggles and LEDs sit in the back 118 mm; the front of the deck is a clear tear-off zone. The deck is cut 207 mm deep so it lifts out past the hinge strip.</li>
<li><b>Speakers: two 3.5" Dayton ND91-8 (v6).</b> Bass is where small speakers lose to a Nest, and bass needs cone travel and air, not tweeters. The ND91 moves 5 mm each way; in ~0.7 L sealed it rolls off near 115 Hz, and a gentle bass EQ on the Pi (PipeWire filter-chain or CamillaDSP, a few % of one core) brings usable bass to about 75 Hz. A TPA3116 amp on its own 24 V plug-pack drives them. 2.5" drivers, racetracks and exciters were all checked: too little cone travel.</li>
</ul>
</div>
</div>

<div class="box-note" style="margin-top:16px">
<h3>v2, later: better than a Nest</h3>
<ul class="tight">
<li><b>Bigger air.</b> The same two ND91s share one ~2.4 L chamber, with two 3–4" passive radiators in the back wall tuned to 50–55 Hz: bass to about 55 Hz with EQ. The box grows another 20–30 mm in height and a few cm in depth; the Pi and power move beside the chamber.</li>
<li><b>Optional tweeters.</b> Two Dayton ND20FB-4 on a simple crossover at ~3.5 kHz (about A$70). The ND91 already reaches 17 kHz, so this is polish, not a fix.</li>
<li><b>Wake word over music.</b> Swap the Lite for the XVF3800 (A$113) and play everything through it (its 48 kHz firmware), with the EQ on the Pi before it. It then hears exactly what the speakers play and can cancel it.</li>
<li><b>One 24 V brick, nothing mains inside.</b> A ~120 W 24 V supply outside (Mean Well GST120A24, about A$60) on one DC socket. Inside, the printer takes 24 V directly, the amp runs on 24 V, and a 24→5 V 5 A converter feeds the Pi (set <code>usb_max_current_enable=1</code>).</li>
<li><b>Cost:</b> about A$300–400 on top of v1.</li>
</ul>
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

</section>

<section id="equipment" role="tabpanel" aria-labelledby="tab-equipment" hidden>
<p>Everything electronic that goes in the box. <b>About $${toBuy()} still to buy</b> (prices approximate, AUD); the Pi, printer and control parts are on hand.</p>
<div class="table-wrap"><table>
<thead><tr><th>Item</th><th>Qty</th><th>Status</th><th>A$</th><th>Why</th></tr></thead>
<tbody>${eqRows}</tbody>
</table></div>
</section>

<section id="build" role="tabpanel" aria-labelledby="tab-build" hidden>
<h2 style="margin-top:0">Cut list</h2>
<p>${pieces} pieces from about half a sheet of 12 mm birch ply, a 9 mm offcut, 6 mm ply for the lid skins, and one length of hardwood for the hinge strip and lid frames. Sizes are length × width × thickness in mm, worked out from the same numbers as the drawing.</p>
<div class="table-wrap"><table>
<thead><tr><th>Part</th><th>Qty</th><th>Size</th><th>Material</th><th>Note</th></tr></thead>
<tbody>${cutRows}</tbody>
</table></div>
<h2>Box hardware</h2>
<p>Fittings for the box itself; the electronics are on the Equipment tab.</p>
<div class="table-wrap"><table>
<thead><tr><th>Item</th><th>Qty</th><th>Note</th></tr></thead>
<tbody>${hwRows}</tbody>
</table></div>
${notes}
</section>
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
  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const show = (id) => {
    tabs.forEach((t) => {
      const on = t.getAttribute("aria-controls") === id;
      t.setAttribute("aria-selected", String(on));
      document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
    });
  };
  tabs.forEach((t) => t.addEventListener("click", () => {
    const id = t.getAttribute("aria-controls");
    show(id);
    try { history.replaceState(null, "", "#" + id); } catch {}
  }));
  const start = location.hash.slice(1);
  if (tabs.some((t) => t.getAttribute("aria-controls") === start)) show(start);
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
