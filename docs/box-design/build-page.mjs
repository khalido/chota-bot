// Builds index.html: both figures render at runtime (lids open), prerendered for first paint.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { renderBox, cutList, hardware, W, D, H, S, chamberL, PLINTH } from './box.mjs';
import { equipment, toBuy, toolsCost } from './parts.mjs';
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
const wData = bundle('wiring.mjs', 'WData');
const wCheck = bundle('wiring-checks.mjs', 'WCheck');
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
// The Equipment tab is a shopping list: v1, v2 and tools. Link, status and notes are inputs the page saves to its db.
const slug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const sectionOf = (e) => (e.group === 'Tools' ? 'tools' : (e.phase ?? (e.status === 'later' ? 2 : 1)) === 2 ? 'v2' : 'v1');
const OPTS = [['', '—'], ['buy', 'To buy'], ['ordered', 'Ordered'], ['have', 'Have'], ['skip', 'Skip']];
const shopRow = (e) => {
	const st = e.status === 'have' ? 'have' : '';
	const cost = (e.aud ?? 0) * e.qty;
	return `<tr data-id="${slug(e.item)}" data-aud="${cost}" data-def-status="${st}" data-def-link="${esc(e.url ?? '')}">
<th><span class="it">${esc(e.item)}</span><span class="why">${esc([e.why, e.source].filter(Boolean).join(' · '))}</span></th>
<td class="n">${e.qty}</td><td class="n">${cost ? `$${cost}` : ''}</td>
<td class="lk"><span class="lkw"><input type="url" name="link" aria-label="Link for ${esc(e.item)}" placeholder="paste link" value="${esc(e.url ?? '')}"><a class="go" href="${esc(e.url ?? '#')}" target="_blank" rel="noopener"${e.url ? '' : ' hidden'} aria-label="Open link">↗</a></span></td>
<td><select name="status" aria-label="Status of ${esc(e.item)}">${OPTS.map(([v, l]) => `<option value="${v}"${v === st ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
<td><textarea name="notes" rows="1" aria-label="Notes on ${esc(e.item)}" placeholder="—"></textarea></td></tr>`;
};
const SECTIONS = [
	['v1', 'v1 · build now', 'The printer, the lid screen, sound out and the face, with PRINT and the volume knob on the Pi’s pins.'],
	['v2', 'v2 · later', 'Waits for the deck, voice and the e-ink. The box is cut for all of it.'],
	['tools', 'Tools', 'For the desk build and the box: wiring the Pi’s pins, soldering, measuring.']
];
const shopTables = SECTIONS.map(([id, title, blurb]) => {
	const rows = equipment.filter((e) => sectionOf(e) === id);
	return `<h2>${title}</h2><p>${blurb} <span class="sum" data-sec="${id}"></span></p>
<div class="table-wrap"><table class="shop" data-sec="${id}">
<thead><tr><th>Item</th><th>Qty</th><th>A$</th><th>Link</th><th>Status</th><th>Notes</th></tr></thead>
<tbody>${rows.map(shopRow).join('')}</tbody>
</table></div>`;
}).join('\n');
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
${rd('wiring.css')}
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
.src { color: var(--ink); font-size: 13px; }
table.shop { min-width: 860px; }
table.shop tbody th { white-space: normal; min-width: 240px; font-weight: 400; }
table.shop .it { display: block; font-weight: 600; }
table.shop .why { display: block; font-size: 12.5px; color: var(--ink); line-height: 1.4; margin-top: 2px; }
table.shop input, table.shop select, table.shop textarea { font: 13px "IBM Plex Sans", system-ui, sans-serif; color: var(--ink-hi); background: var(--bg); border: 1px solid var(--edge); border-radius: 6px; padding: 4px 6px; }
table.shop input:focus-visible, table.shop select:focus-visible, table.shop textarea:focus-visible { outline: 2px solid var(--live); outline-offset: 0; }
table.shop :disabled { opacity: .7; cursor: default; }
.lkw { display: flex; gap: 4px; align-items: center; }
table.shop input[type=url] { width: 130px; }
table.shop .go { text-decoration: none; color: var(--ink-hi); font-weight: 600; padding: 2px 4px; }
table.shop textarea { width: 100%; min-width: 180px; resize: vertical; field-sizing: content; min-height: 28px; }
tr[data-status="have"] .it, tr[data-status="ordered"] .it { color: var(--ink); }
tr[data-status="skip"] .it { text-decoration: line-through; color: var(--ink); }
.sum { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 13px; color: var(--ink); white-space: nowrap; }
.save { font-size: 13px; color: var(--ink); }
</style>
<main>
<h1>Chota box · v13</h1>
<p class="lead">The box is <b>${W} × ${D} × ${H} mm</b>, on a dark plinth set ${PLINTH.h} mm under it. An 8" screen sits flush in the lid's wood; under the lid are the dials, PRINT and a needle meter. The front is two panels, split under the lid seam. On the left, one 2.5" SB65 speaker in a ~${chamberL()} L chamber, with a passive radiator on the box's left end for bass and two mic pinholes above. A small amp board, separate so it can be swapped, drives it. On the right, over the printer, one smoked window holds the face (an 8 × 8 LED grid that shows when chota hears, thinks and talks), the radar and the camera; under it sit a volume knob, TALK and three buttons. Hold TALK and the box goes quiet and listens. Paper rises through a slot in the printer's lid, which also carries a 4.2" e-ink; lift that lid to change the roll. A light strip in the plinth washes the bench toward whoever walks up. No mains inside: the Pi's lead and one 24 V brick come in at the back.</p>

<div class="tabs" role="tablist">
<button role="tab" id="tab-design" aria-controls="design" aria-selected="true">Design</button>
<button role="tab" id="tab-equipment" aria-controls="equipment" aria-selected="false">Equipment</button>
<button role="tab" id="tab-wiring" aria-controls="wiring" aria-selected="false">Wiring</button>
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
<li><b>The printer's depth</b>, exactly: drawn at ${S.printer.pd} ("about 17.5 cm"), with ${S.cableGap} mm behind it for plugs and ${S.frontGap} mm in front for the eye and its controls. It sets the box's depth to the millimetre.</li>
<li><b>Right-angle plugs for the printer.</b> The ${S.cableGap} mm behind it assumes a right-angle USB-B lead and DC plug. If they don't fit its sockets, the box goes back to ${D + 40 - S.cableGap} deep.</li>
<li><b>TALK's body depth.</b> It sits in the ${S.frontGap} mm in front of the printer, counterbored from inside: a short-body 16–19 mm button, measured before buying.</li>
<li><b>The SB65's frame and cut-out.</b> Drawn as a 64 mm square frame on a 56 mm hole; the cut-out is assumed. Check SB Acoustics' datasheet, or template from a driver in hand, before cutting the front wall.</li>
<li><b>What sits behind the 8" glass.</b> Waveshare's drawing shows 1.6 mm of board plus 8 mm parts (the Pi-mounting standoffs); the lid has about 9 mm behind the glass. Leave the standoffs off, or the lid grows 1–2 mm.</li>
</ul>
</div>
<div class="box-note">
<h3>Changed from box.md</h3>
<ul class="tight">
<li><b>The paper slot is cut into the printer's lid</b>, right over the paper exit, with a chamfered mouth and an angled guide under it so the curl can't fold back. To change the roll: lift that lid ("Printer open"), flip the printer's cover, drop in the roll. The printer's cover hinges at its back, so a fixed strip above the exit would block it; two dowels seat the lid so the slot always lines up.</li>
<li><b>One rim height.</b> Every wall stops at ${H - 20} mm and both lids are 20 mm deep, so the box closes flat. The deck sits ${S.deckGap} mm under the lid. The printer's 130 mm sets the rim.</li>
<li><b>Mic and a TALK button on the front</b>, so voice works with the lid shut (TALK moved under the eye in v12).</li>
<li><b>One screen (v4).</b> The deck screen is gone: the dials are only reachable with the lid open, and then the lid screen faces you, so turning WHO or WHAT shows there. That frees the Pi's second camera/display port for a Pi Camera Module 3 and means one kiosk window instead of two. A needle meter takes its place on the deck.</li>
<li><b>ReSpeaker Lite, not the XVF3800 (v5).</b> Two mics, the same XMOS echo cancelling, A$43 instead of A$113. In v1 it only listens: all sound (speech and music) plays through a small USB sound card into the amp, because the Lite tops out at 16 kHz. TALK pauses everything while held, so there's no echo to cancel. The mic sits behind the front rim, above the deck: higher, and away from the speakers.</li>
<li><b>One speaker and a side radiator (v13).</b> Back to one SB65, centred on the left panel, with a Dayton ND65-PR passive radiator on the left end into the same chamber, behind a matching mesh disc. It takes the bass from about 150 Hz (sealed) toward 80–90 Hz with no bigger box; a second driver would have added loudness, not bass. The amp stays its own small board (line in, screw terminals out, 24 V in) so it can be swapped or tinkered with; its second channel is spare. A pair of 2" drivers (DMA58) was checked: together they move about the same air as one SB65, play louder, but start higher (Fs 166 Hz against 115).</li>
<li><b>One eye, two panels, a plinth (v12, from a design review).</b> The face moves to the printer bay's front, inside one ${S.frontGap} mm-deep smoked window with the radar and the camera; the knob, TALK and three buttons sit in a row under it. The front is split by a groove under the lid seam: speakers on the left, the eye on the right, so the front answers the two lids. With the face out of the chamber, a second SB65 fits beside the first. The box sits on a dark plinth set ${PLINTH.in} mm in, with the light strip inside it; round-hole vents replace the slots; barrel hinges replace the brass leaves, so the hinge strip narrows to ${S.strip}; brass is kept for what you touch. The glass sits flush in the lid, 3 mm of wood round it. Right-angle plugs on the printer and 2 mm side clearance take the box to ${W} × ${D}.
<svg viewBox="0 0 640 210" role="img" aria-label="Footprints from above: v11, v12 and a 5-inch option" style="display:block;width:100%;max-width:560px;margin:10px 0 4px;font:12px 'IBM Plex Mono',monospace">
${[
	['v11', 361, 254, 203],
	['v12, 8"', W, D, 200],
	['5" option', 306, D, 150]
]
	.map(([n, w, d, l], i) => {
		const k = 0.55, x = 10 + i * 215, y = 10;
		return `<rect x="${x}" y="${y}" width="${w * k}" height="${d * k}" fill="none" stroke="var(--ink-hi)" stroke-width="1.5" rx="2"/><line x1="${x + l * k}" y1="${y + 30 * k}" x2="${x + l * k}" y2="${y + d * k}" stroke="var(--ink)" stroke-dasharray="3 3"/><line x1="${x}" y1="${y + 30 * k}" x2="${x + w * k}" y2="${y + 30 * k}" stroke="var(--ink)" stroke-dasharray="3 3"/><text x="${x}" y="${y + d * k + 18}" fill="var(--ink-hi)">${n}</text><text x="${x}" y="${y + d * k + 34}" fill="var(--ink)">${w} × ${d}</text>`;
	})
	.join('')}
</svg>
<span class="src">Seen from above, front at the bottom; dashed: the hinge strip and the lid seam. The 5" (Pi Touch Display 2, 143.5 wide) takes the box to 306, but fits only one SB65 and a deck 50 mm narrower. Not drawn in full.</span></li>
<li><b>Smaller box: 8" screen, one 2.5" speaker, no divider (v11; a pair in v12, one plus a radiator in v13).</b> The 10.1" made the box 424 wide. The 8" Waveshare (C) keeps the same 1280 × 800 and the same dimming, and takes the lid to 203 mm. One SB Acoustics SB65 (2.5", from Wagner) replaces the ND91 pair: clear voice and mids and wide treble, with bass to about 90–100 Hz at full kitchen volume; stereo from drivers 15 cm apart adds little. Its 64 mm frame drops the box 19 mm to the printer's height plus the lid, and leaves room for the face beside it. The divider is gone: a hardwood post and rail carry the deck's right edge, the chamber's 12 mm end panel is the front post, the lids rest on the front wall and hinge strip, and four blocks on the base locate the printer. The face's board sits inside the chamber, sealed by its acrylic window; the radar, knob and buttons move to the bay front, which keeps ${S.frontGap} mm clear in front of the printer for them. The printer (measured 140 × 175 × 130) now sets the depth.</li>
<li><b>A face on the bay front (v10; moved beside the speaker in v11).</b> The speakers fill the left of the front wall (12.5 mm between their frames), so the face goes on the printer bay's blank front. A GlowBit 8 × 8 LED grid (61 mm square, A$17) behind smoked acrylic shows wake, listening, thinking, talking and roll call. The Pi drives it, since the wake word and the agent run there: one GPIO pin through Adafruit's Pi 5 library, a level shifter, and its own 5 V from a buck on the 24 V lead. Under it, an LD2450 radar behind a plain window (no metal) tells the Pico where people are by angle, and an SK6812 strip in the base's front edge glows dimly toward whoever is near. A knob (volume) and three small buttons sit below, wired to the Pico through a Ø10 hole in the divider behind the speaker chamber. The printer gets only two thin vents at the front; its main vents move to the back and a styled one on the right end. Check: the printer is listed 180 deep, which leaves 18 mm behind the bay front: enough for flat boards and a counterbored encoder, not a panel pot.</li>
<li><b>Three kinds of screen (v9).</b> The 10.1" LCD in the lid stays the main screen: anything interactive or moving. Three small amber OLEDs on the deck, behind smoked acrylic, show what WHO and WHAT are set to and what chota is doing ("listening…"); the Pico drives them, so they change the instant a dial turns. A Waveshare 4.2" e-ink (black, white and red, A$58) sits in the printer lid behind the paper slot and shows the day with the box shut, using no power between updates. A second DSI screen was ruled out: the Pi 5's other screen-or-camera port carries the camera. The 7.3" Inky doesn't fit that lid without growing the box: 174 mm wide against 156 between the lid's rails, or 174 deep against the 143 behind the slot.</li>
<li><b>One speaker chamber, power outside (v8).</b> A single sealed chamber across the front, built from two 6 mm panels (the base, front wall, end and divider are its other sides): ~${chamberL()} L instead of 2 × 0.7, so the bass EQ works less hard. The deck rests on 4 mm strips along its top, and the camera ribbon and mic lead run in that gap. No powerboard and no bricks inside: the Pi's lead and one 24 V 5 A brick (printer + amp, split inside) come in through grommets in the back wall. If printing ticks in the music, the amp gets its own pack.</li>
<li><b>Deck controls moved back (v7, from Gemini's review).</b> The speaker chamber fills the front 90 mm under the deck, so the button, dials, meter, toggles and LEDs sit in the back 118 mm; the front of the deck is a clear tear-off zone. The deck is cut 207 mm deep so it lifts out past the hinge strip.</li>
<li><b>Speakers: two 3.5" Dayton ND91-8 (v6; replaced in v11).</b> Bass is where small speakers lose to a Nest, and bass needs cone travel and air, not tweeters. The ND91 moves 5 mm each way; sealed in this volume it rolls off around 110–120 Hz, and a gentle bass EQ on the Pi (PipeWire filter-chain or CamillaDSP, a few % of one core) brings usable bass to about 75 Hz. A TPA3116 amp on 24 V drives them. 2.5" drivers, racetracks and exciters were all checked: too little cone travel.</li>
</ul>
</div>
</div>

<div class="box-note" style="margin-top:16px">
<h3>v2, later: better than a Nest</h3>
<ul class="tight">
<li><b>More bass.</b> A bigger radiator (DMA80-PR) for a chamber 16 mm deeper. For real bass, the 3.5" ND91 pair in ~2 L again, which costs 19 mm of height and some width back.</li>
<li><b>A tweeter.</b> A ¾" dome with the crossover in the Pi's DSP (on the amp's spare channel). The SB65 already reaches the top, so this is polish, not a fix.</li>
<li><b>Wake word over music.</b> Swap the Lite for the XVF3800 (A$113) and play everything through it (its 48 kHz firmware), with the EQ on the Pi before it. It then hears exactly what the speakers play and can cancel it.</li>
<li><b>One lead.</b> A ~120 W 24 V supply outside (Mean Well GST120A24, about A$60) on one DC socket, and a 24→5 V 5 A converter for the Pi (set <code>usb_max_current_enable=1</code>), so the Pi's own lead goes too.</li>
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
<p>The shopping list for the electronics: about <b>$${toBuy()} for v1</b>, plus about $${toolsCost()} of tools (AUD, approximate). Add a link, set the status and write notes in any row; they save to this page for everyone who opens it. <span class="save" id="save-state"></span></p>
${shopTables}
</section>

<section id="wiring" role="tabpanel" aria-labelledby="tab-wiring" hidden>
<p>Which wire goes where. Solid wires are settled in box.md; dashed ones are picked here, each with a reason. Tick a wire once it is on the board. The ticks save to this page for everyone who opens it.</p>
<div class="wctl">
  <div class="wseg" role="group" aria-label="View">
    <button type="button" data-wtab="pi" aria-pressed="true">Pi 5</button>
    <button type="button" data-wtab="pico" aria-pressed="false">Pico</button>
    <button type="button" data-wtab="box" aria-pressed="false">Whole box</button>
  </div>
  <div class="wseg" role="group" aria-label="Phase">
    <button type="button" data-wphase="v1" aria-pressed="true">v1</button>
    <button type="button" data-wphase="later" aria-pressed="false">later</button>
    <button type="button" data-wphase="all" aria-pressed="false">all</button>
  </div>
  <label class="chk w-free-wrap"><input type="checkbox" class="w-free"> Show free pins</label>
  <span class="prog w-prog"></span>
  <button class="wbtn w-reset" type="button">Reset ticks</button>
</div>
<div class="wlayout">
  <div class="wcard w-plan"></div>
  <div class="side">
    <section class="wcard"><div class="w-pininfo"></div></section>
    <section class="wcard"><div class="w-partinfo"></div></section>
    <section class="wcard"><h2>Checks</h2><div class="w-checks"></div></section>
    <section class="wcard"><h2>Parts shown</h2><div class="checklist w-checklist"></div></section>
  </div>
</div>
<section class="wcard" style="margin-top:16px">
  <div class="tablehead"><h2 style="margin:0">Wiring table</h2><button class="wbtn w-copy" type="button">Copy table</button></div>
  <div class="wrap w-fulltable"></div>
</section>
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
(() => {
${wData}
${wCheck}
${rd('wiring-client.js')}
})();
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
(async () => {
  // Shopping list: rows carry their defaults; db docs items/<id> hold {link, status, notes}.
  const rows = new Map([...document.querySelectorAll("table.shop tr[data-id]")].map((r) => [r.dataset.id, r]));
  const saveEl = document.getElementById("save-state");
  const field = (r, n) => r.querySelector('[name="' + n + '"]');
  const paint = (r) => {
    const link = field(r, "link").value.trim(), a = r.querySelector("a.go");
    a.hidden = !/^https?:/.test(link); if (!a.hidden) a.href = link;
    r.dataset.status = field(r, "status").value;
  };
  const sums = () => document.querySelectorAll(".sum[data-sec]").forEach((el) => {
    const rs = [...document.querySelectorAll('table.shop[data-sec="' + el.dataset.sec + '"] tr[data-id]')];
    const total = rs.reduce((n, r) => n + +r.dataset.aud, 0);
    const left = rs.filter((r) => !["have", "ordered", "skip"].includes(r.dataset.status)).reduce((n, r) => n + +r.dataset.aud, 0);
    el.textContent = total ? "$" + left + " of $" + total + " priced still to get." : "";
  });
  rows.forEach(paint); sums();
  const lock = (msg) => { rows.forEach((r) => r.querySelectorAll("input,select,textarea").forEach((x) => (x.disabled = true))); saveEl.textContent = msg; };
  const db = window.claude?.use ? await window.claude.use("db") : null;
  if (!db) return lock("Open this page on claude.ai, signed in, to edit the list.");
  const user = await window.claude.use("user");
  if ((await user?.can("data.write")) === false) return lock("View only.");
  const col = db.collection("items");
  const queue = new Map(), timers = new Map();
  const write = (id) => {
    const r = rows.get(id);
    const body = { link: field(r, "link").value.trim(), status: field(r, "status").value, notes: field(r, "notes").value, updated: new Date().toISOString() };
    saveEl.textContent = "Saving…";
    const p = (queue.get(id) || Promise.resolve()).then(() => col.doc(id).set(body)).then(
      () => { saveEl.textContent = "Saved."; },
      (e) => { if (e?.code === "invalid_argument") lock("View only."); else saveEl.textContent = "Not saved (" + (e?.code || "error") + "). Try again."; }
    );
    queue.set(id, p);
  };
  rows.forEach((r, id) => {
    field(r, "status").addEventListener("change", () => { paint(r); sums(); write(id); });
    ["link", "notes"].forEach((n) => {
      const el = field(r, n);
      el.addEventListener("input", () => { if (n === "link") paint(r); clearTimeout(timers.get(id)); timers.set(id, setTimeout(() => write(id), 800)); });
      el.addEventListener("blur", () => { if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); write(id); } });
    });
  });
  col.onSnapshot((snap) => {
    snap.docs.forEach((d) => {
      const r = rows.get(d.id); if (!r || !d.exists) return;
      const v = d.data();
      for (const n of ["link", "status", "notes"]) {
        const el = field(r, n);
        if (typeof v[n] === "string" && document.activeElement !== el && !timers.has(d.id)) el.value = v[n];
      }
      paint(r);
    });
    sums();
  }, (e) => { saveEl.textContent = "Live updates stopped (" + e.code + "). Reload to resume."; });
})();
</script>
`;
writeFileSync(DIR + 'index.html', page);
console.log('wrote index.html', page.length, 'bytes; wall:', hasWall, 'notes:', !!notes);
