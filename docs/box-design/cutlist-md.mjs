import { cutList, hardware, W, D, H, S } from './box.mjs';
const rows = cutList()
	.map((c) => `| ${c.part} | ${c.qty} | ${c.size.join(' × ')} | ${c.mat} | ${c.note ?? ''} |`)
	.join('\n');
console.log(`# Chota box v2: cut list for review

A counter-top wooden box for a Raspberry Pi 5 kitchen gadget. Outside: ${W} W × ${D} D × ${H} H mm closed. Butt-jointed, glued and pinned/screwed, built by a hobbyist with a drill, a saw, a router (rebates) and clamps.

Layout: left zone ${244} mm wide holds a recessed control deck (dials, a 30 mm arcade button, toggles, a 5" screen) under a lid. The lid's inner face is a 10.1" screen module (235 × 161 × ~10 mm, held in a 4.5 mm lip, routed rebate) with a 38 mm speaker strip below it holding two slim 70 × 30 mm drivers (15 mm deep). Lid is a 28 mm deep frame (12 mm strips on edge) with a 6 mm ply skin; hinged on a fixed ${S.strip} mm hardwood strip along the back with brass butt hinges; opens 110° (leans back 20°) and a brass chain stops it. Right zone: a printer bay (thermal receipt printer, listed 140 W × 180 D × 125 H, NOT measured yet; 40 mm behind it for plugs) under a service lid of the same construction, with an 80 mm paper slot (90 × 5) in the service lid. Walls 12 mm birch ply, all ${H - 28 - 12} mm tall standing on a 12 mm base; all wall tops at ${H - 28} mm; lids 28 mm on top. Under the deck: Pi 5, a 2-outlet powerboard with the Pi plug-pack and the printer brick, a USB mic/sound board behind a front grille, a small amp. One power cord.

| Part | Qty | Size (mm, L × W × T) | Material | Note |
|---|---|---|---|---|
${rows}

Hardware: ${hardware.join('; ')}.

Questions for the reviewer: Is the piece count and sizing right for these joints (do any pieces overlap or come up short)? Is 12 mm ply strong and stiff enough; would 9 mm do anywhere? Will a 28 mm lid frame with a 6 mm skin hold a 10.1" glass panel and two drivers without racking, and do the drivers get enough air? Do the hinges and chain make sense at this weight? Heat: the Pi 5 with Active Cooler, a printer and two power supplies in a closed box with vent slots in the front and left end: enough? Anything a first-time builder would get wrong (order of assembly, what to cut last, what to measure first)? What is missing from the list? Keep the answer to a short list of concrete changes.`);
