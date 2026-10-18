import { cutList, hardware, W, D, H, S, chamberL } from './box.mjs';
const rows = cutList()
	.map((c) => `| ${c.part} | ${c.qty} | ${c.size.join(' × ')} | ${c.mat} | ${c.note ?? ''} |`)
	.join('\n');
console.log(`# Chota box: cut list for review

A counter-top wooden box for a Raspberry Pi 5 kitchen gadget. Outside: ${W} W × ${D} D × ${H} H mm closed. Butt-jointed, glued and pinned/screwed, built by a hobbyist with a drill, a saw, a router (rebates) and clamps.

Layout: the left zone (${244} mm wide) holds a recessed control deck (two dials, a needle meter, a 30 mm arcade button, toggles, LEDs) under a lid whose inner face is a 10.1" screen module (235 × 161, routed rebate, 4.5 mm lip). The lid is a ${S.lidT} mm frame with a 6 mm ply skin, hinged on a fixed ${S.strip} mm hardwood strip along the back; it opens 110° and a brass chain stops it. Right zone: a printer bay (thermal receipt printer, listed ${S.printer.pw} W × ${S.printer.pd} D × ${S.printer.ph} H, not measured yet; 40 mm behind it for plugs) under a service lid of the same construction, with the paper slot (90 × 5) in the service lid. Under the deck, front: one sealed speaker chamber (~${chamberL()} L; a 6 mm ply back and top, the base, front wall, left end and divider as its other sides) for two front-mounted 3.5" drivers; the deck rests on 4 mm strips on its top. Behind it the Pi 5, a USB sound card, a small amp and a Pico. The mic board, a TALK button and a camera sit behind the front rim above the deck. No mains inside: the Pi's USB-C lead and one 24 V lead (printer + amp) come in through grommets in the back wall.

| Part | Qty | Size (mm, L × W × T) | Material | Note |
|---|---|---|---|---|
${rows}

Hardware: ${hardware.map((h) => `${h.qty} × ${h.item} (${h.note})`).join('; ')}.

Questions for the reviewer: Is the piece count and sizing right for these joints (do any pieces overlap or come up short)? Is 12 mm ply strong and stiff enough; would 9 mm do anywhere? Will the lid frame hold a 10.1" glass panel without racking? Do the speaker chambers seal and fit under the deck? Do the hinges and chain make sense at this weight? Heat: the Pi 5 with Active Cooler, a printer and an amp in a closed box with vent slots: enough? Anything a first-time builder would get wrong (order of assembly, what to cut last, what to measure first)? What is missing from the list? Keep the answer to a short list of concrete changes.`);
