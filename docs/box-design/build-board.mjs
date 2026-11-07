// Writes board.html: one self-contained page for arranging the wall board's parts.
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { SPECS } from './board.mjs';

const DIR = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(DIR, name), 'utf8');
const inline = (name) => read(name).replace(/^import .*$/gm, '').replace(/^export /gm, '');
const size = (s) => (s.r !== undefined ? `Ø ${s.r * 2}` : `${s.du} × ${s.dz}`);
const rows = Object.values(SPECS)
	.map((s) => `<tr><td>${s.name}</td><td>${size(s)}</td><td>${s.out}</td><td>${s.source}</td></tr>`)
	.join('');

writeFileSync(
	join(DIR, 'board.html'),
	`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Chota wall board</title>
<style>${read('figure.css')}
body{margin:0;background:var(--bg);color:var(--ink-hi);font:16px/1.45 Helvetica,Arial,sans-serif}
main{max-width:1320px;margin:auto;padding:16px}
h1{font-size:26px;margin:0 0 4px}h2{font-size:19px;margin:0 0 8px}h3{font-size:16px;margin:0 0 6px}
p{margin:0 0 8px;color:var(--ink)}.small{font-size:13px}
section{background:var(--panel);border:1px solid var(--edge);border-radius:12px;padding:14px;margin:12px 0}
.grid{display:grid;grid-template-columns:minmax(0,3fr) minmax(280px,1fr);gap:12px;align-items:start}.grid section{margin:0}
#front{touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none}#front:active{cursor:grabbing}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:end;margin-bottom:8px}.row label{font-size:14px}
input[type=number]{width:72px;font:inherit;display:block;background:var(--bg);color:inherit;border:1px solid var(--edge);border-radius:6px;padding:4px}
select,button{font:inherit;min-height:36px;background:var(--bg);color:inherit;border:1px solid var(--edge);border-radius:6px;padding:4px 8px}
input[type=range]{width:100%;display:block}
#parts label{display:block;font-size:14px;padding:3px 0}
#view{position:relative;height:min(68vh,620px);touch-action:none;border-radius:8px;overflow:hidden;cursor:grab}#view canvas{display:block}
.labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.pill{position:absolute;transform:translate(-50%,-50%);font:600 12px/1 Helvetica,Arial,sans-serif;background:#fff;color:#222;border:1px solid #999;border-radius:9px;padding:2px 5px}
.pill.ruler{background:none;border:0;color:#333;font-weight:400}
.pop{position:fixed;z-index:20;width:290px;background:var(--panel);border:1px solid var(--edge);border-radius:10px;padding:12px;box-shadow:0 6px 24px rgba(0,0,0,.35)}.pop h3{padding-right:30px}.pop label{display:block;font-size:14px;margin:8px 0}
#close{position:absolute;top:6px;right:6px;min-height:30px;width:30px;padding:0;border:0;background:none;font-size:20px}
@media(max-width:820px){.pop{left:12px!important;right:12px;top:auto!important;bottom:12px;width:auto}}
.tools{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}.tools label{font-size:14px}
#warn{color:var(--accent);margin:0 0 8px;padding-left:18px;font-size:14px}
#copied{width:100%;height:70px}
table{border-collapse:collapse;width:100%;font-size:14px}td,th{text-align:left;padding:5px 8px 5px 0;border-bottom:1px solid var(--edge);vertical-align:top}
@media(max-width:820px){.grid{grid-template-columns:minmax(0,1fr)}}
</style>
<main><h1>Chota wall board</h1><p>Rotate the model to see how far things stick out, tap a part for details, and drag parts on the plan below it. Your layout saves on this device. Sizes come from the table at the bottom, and some are estimates.</p>
<div class="grid"><div>
<section><h2>3D model</h2><div class="tools" id="view-tools"><button data-view="angle">Angle</button><button data-view="front">Front</button><button data-view="side">Side</button><button data-view="top">Top</button><button data-view="low">From below</button><button data-view="back">Back</button><label><input id="numbers" type="checkbox" checked> mm from the board's face</label><label>Board solid <input id="solid" type="range" min="20" max="100" step="5" style="width:110px;display:inline-block;vertical-align:middle"></label></div>
<p class="small">Tap a part for details. Drag to rotate, pinch to zoom, two fingers to move. Rulers are in mm, and the one in the Side view measures from the wall. Pale red is room for the Pi's plugs.</p>
<div id="view" hidden></div><div id="fallback"></div></section>
<section><h2>Arrange</h2><div class="row"><label>Start from<br><select id="preset"></select></label><label>Width, mm<input id="bw" type="number" min="1"></label><label>Height, mm<input id="bh" type="number" min="1"></label><label>Thickness, mm<input id="bt" type="number" min="1"></label><label>Wall gap, mm<input id="bg" type="number" min="0"></label><label>Pattern<br><select id="grid"><option value="">Plain</option><option value="holes">Pegboard holes, 25 mm</option><option value="lines">Lines, 25 mm</option></select></label></div>
<div class="row"><label>Add<br><select id="add-kind"></select></label><button id="add">Add part</button><button id="flat">Flat board: no pockets</button><button id="copy">Copy layout</button></div>
<textarea id="copied" hidden></textarea>
<p id="note" class="small"></p><ul id="warn" hidden></ul><p id="stats"></p><div id="front"></div></section>
</div><div>
<section><h2>How far parts stick out</h2><p class="small">In mm.</p><table id="jut"></table></section>
<section><h2>Holes to cut</h2><div id="cuts"></div><p class="small">Each pocket includes 3 mm clearance. The Pi's also has 25 mm for plugs on two sides, which is a guess.</p></section>
<section><h2>Parts</h2><div id="parts"></div></section>
</div></div>
<section><h2>Part sizes</h2><p>In mm. "Out" is how far a part stands off the board's face before sinking.</p><table><tr><th>Part</th><th>Size</th><th>Out</th><th>Source</th></tr>${rows}</table></section>
</main>
<div id="part" class="pop" hidden></div><script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.min.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"}}</script>
<script>
${inline('common.mjs')}
${inline('board.mjs')}
${read('board3d.js')}
${read('board-client.js')}
</script></html>`
);
console.log('wrote board.html');
