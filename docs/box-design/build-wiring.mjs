// Builds wiring.html: the bench wiring planner for the Pi 5 and the Pico 2 W. One self-contained page.
// Usage: node docs/box-design/build-wiring.mjs [data.mjs]   (a data file to use instead of wiring.mjs, for testing the checks)
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
const DIR = new URL('.', import.meta.url).pathname;
const rd = (f) => readFileSync(DIR + f, 'utf8');
const data = await import(process.argv[2] ? resolve(process.argv[2]) : './wiring.mjs');
const { boards, parts, limits } = data;
// '<' escaped so no string in the data can close the script tag.
const json = JSON.stringify({ boards, parts, limits }).replace(/</g, '\\u003c');
const out = process.env.WIRING_OUT || DIR + 'wiring.html';

const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chota Wiring Planner</title>
<style>
${rd('figure.css')}
${rd('wiring.css')}
</style>
<main>
<h1>Chota box · wiring</h1>
<p class="lead">Which wire goes where on the Pi 5 and the Pico 2 W. Solid wires are settled in box.md; dashed ones are pins picked here, each with a reason. Tick a wire once it is on the board.</p>

<div class="controls">
  <div class="seg" role="tablist" aria-label="Board">
    <button role="tab" data-tab="pi" aria-selected="true">Pi 5</button>
    <button role="tab" data-tab="pico" aria-selected="false">Pico</button>
  </div>
  <div class="seg" role="group" aria-label="Phase">
    <button data-phase="v1" aria-pressed="true">v1</button>
    <button data-phase="later" aria-pressed="false">later</button>
    <button data-phase="all" aria-pressed="false">all</button>
  </div>
  <label class="chk"><input type="checkbox" id="free"> Show free pins</label>
  <span class="prog" id="prog"></span>
  <button class="t" id="reset" type="button">Reset ticks</button>
</div>

<div class="layout">
  <div class="card" id="plan"></div>
  <div class="side">
    <section class="card"><div id="pininfo"></div></section>
    <section class="card"><div id="partinfo"></div></section>
    <section class="card"><h2>Checks</h2><div id="checks"></div></section>
    <section class="card"><h2>Parts shown</h2><div class="checklist" id="checklist"></div></section>
  </div>
</div>

<section class="card" style="margin-top:16px">
  <div class="tablehead"><h2 style="margin:0">Wiring table</h2><button class="t" id="copy" type="button">Copy table</button></div>
  <div class="wrap" id="fulltable"></div>
</section>
</main>
<script>
const DATA = ${json};
${rd('wiring-client.js')}
</script>
</html>
`;
writeFileSync(out, page);
console.log(`wrote ${out} (${(page.length / 1024).toFixed(0)} KB)`);
