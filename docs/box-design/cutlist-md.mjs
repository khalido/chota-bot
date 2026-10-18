import { cutList, hardware, W, D, H, S, chamberL } from './box.mjs';
const rows = cutList()
	.map((c) => `| ${c.part} | ${c.qty} | ${c.size.join(' × ')} | ${c.mat} | ${c.note ?? ''} |`)
	.join('\n');
console.log(`# Chota box: cut list for review

A counter-top wooden box for a Raspberry Pi 5 kitchen gadget. Outside: ${W} W × ${D} D × ${H} H mm closed. Butt-jointed, glued and pinned/screwed, built by a hobbyist with a drill, a saw, a router (rebates) and clamps.

Layout: the left zone (${S.screen[0] + 2 * S.lip} mm wide) holds a recessed control deck (two dials, a needle meter, a 30 mm arcade button, toggles, LEDs, three small OLEDs) under a lid whose inner face is an 8" screen module (${S.screen.join(' × ')}, routed rebate, 4.5 mm lip). The lid is a ${S.lidT} mm frame with a 6 mm ply skin, hinged on a fixed ${S.strip} mm hardwood strip along the back; it opens 110° and a brass chain stops it. Right zone: the thermal printer (measured ${S.printer.pw} W × ${S.printer.pd} D × ${S.printer.ph} H) located by blocks on the base, ${S.cableGap} mm behind it for plugs and ${S.frontGap} mm in front for a knob, three buttons and a radar board behind the bay front, under a service lid of the same construction with the paper slot (90 × 5) and a 4.2" e-ink. There is no divider: a hardwood post and rail carry the deck's right edge and the lids rest on the front wall and hinge strip. Under the deck, front: one sealed speaker chamber (~${chamberL()} L; 6 mm ply back and top, a 12 mm end panel, with the base, front wall and left end as its other sides) for one front-mounted 2.5" driver, with an LED-matrix face beside it behind a glued acrylic window. Behind it the Pi 5, a USB sound card, a small amp and a Pico. The mic board, a TALK button and a camera sit behind the front rim above the deck. No mains inside: the Pi's USB-C lead and one 24 V lead (printer + amp) come in through grommets in the back wall.

| Part | Qty | Size (mm, L × W × T) | Material | Note |
|---|---|---|---|---|
${rows}

Hardware: ${hardware.map((h) => `${h.qty} × ${h.item} (${h.note})`).join('; ')}.

Questions for the reviewer: Is the piece count and sizing right for these joints (do any pieces overlap or come up short)? Is 12 mm ply strong and stiff enough; would 9 mm do anywhere? Will the lid frame hold an 8" glass panel without racking? Does the speaker chamber seal and fit under the deck, with the face board inside it? Do the lids sit well with no divider under their meeting edges? Do the hinges and chain make sense at this weight? Heat: the Pi 5 with Active Cooler, a printer and an amp in a closed box with vent slots: enough? Anything a first-time builder would get wrong (order of assembly, what to cut last, what to measure first)? What is missing from the list? Keep the answer to a short list of concrete changes.`);
