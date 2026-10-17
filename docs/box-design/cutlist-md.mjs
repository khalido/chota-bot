import { cutList, hardware, W, D, H, S } from './box.mjs';
const rows = cutList()
	.map((c) => `| ${c.part} | ${c.qty} | ${c.size.join(' × ')} | ${c.mat} | ${c.note ?? ''} |`)
	.join('\n');
console.log(`# Chota box: cut list for review

A counter-top wooden box for a Raspberry Pi 5 kitchen gadget. Outside: ${W} W × ${D} D × ${H} H mm closed. Butt-jointed, glued and pinned/screwed, built by a hobbyist with a drill, a saw, a router (rebates) and clamps.

Layout: the left zone (${244} mm wide) holds a recessed control deck (two dials, a needle meter, a 30 mm arcade button, toggles, LEDs) under a lid whose inner face is a 10.1" screen module (235 × 161, routed rebate, 4.5 mm lip). The lid is a ${S.lidT} mm frame with a 6 mm ply skin, hinged on a fixed ${S.strip} mm hardwood strip along the back; it opens 110° and a brass chain stops it. Right zone: a printer bay (thermal receipt printer, listed ${S.printer.pw} W × ${S.printer.pd} D × ${S.printer.ph} H, not measured yet; 40 mm behind it for plugs) under a service lid of the same construction, with the paper slot (90 × 5) in the service lid. Under the deck, front: two sealed speaker chambers (6 mm ply, the front wall as baffle) for 3.5" drivers; behind them the Pi 5, a 3-outlet powerboard with the Pi supply, the printer brick and the amp plug-pack, a USB sound card and a small amp. The mic board, a TALK button and a camera sit behind the front rim above the deck. One power cord.

| Part | Qty | Size (mm, L × W × T) | Material | Note |
|---|---|---|---|---|
${rows}

Hardware: ${hardware.map((h) => `${h.qty} × ${h.item} (${h.note})`).join('; ')}.

Questions for the reviewer: Is the piece count and sizing right for these joints (do any pieces overlap or come up short)? Is 12 mm ply strong and stiff enough; would 9 mm do anywhere? Will the lid frame hold a 10.1" glass panel without racking? Do the speaker chambers seal and fit under the deck? Do the hinges and chain make sense at this weight? Heat: the Pi 5 with Active Cooler, a printer, an amp and three power supplies in a closed box with vent slots: enough? Anything a first-time builder would get wrong (order of assembly, what to cut last, what to measure first)? What is missing from the list? Keep the answer to a short list of concrete changes.`);
