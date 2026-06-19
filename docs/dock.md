# Chota Dock — the Raspberry Pi dual-screen box

> **Plan, not spec.** Pre-implementation, like `docs/agent.md` / `docs/telegram.md`.
> The hardware below is ordered (Core Electronics order #1000690836, 11 Jun 2026);
> the enclosure and firmware are not built yet. Records intent + reasoning so
> future-me knows what the parts are *for* and why the wiring lands where it does.

## What this is

A wooden box the kids walk up to and *operate*. Two screens:

- **Top — 7", in the lid.** The lid opens up; the screen lives on the inside face,
  angled at the kid like a laptop. Ambient/display surface — the literary court
  clock (`/clock`), weather, a photo, whatever's showing. Mostly look-don't-touch.
- **Bottom — 5", in the base.** A *control feedback* screen. It exists to answer
  the **switches and dials** on the front panel. Turn a dial → the bottom screen
  shows what you're about to print/do; flip a switch → mode changes; smack the
  big button → it prints. Kids print their own receipts: a story, a puzzle, a
  joke, a fact — pick-a-dial, see-it-on-the-little-screen, press-to-print.

This is the physical front-end for everything Chota already does. The print
catalogue (`today`, `joke`, `crossword`, `puzzle`, per-kid briefs, `+`) is
already built and POST-able at `/api/print/<kind>` — the dock is a tangible,
no-keyboard way for kids to drive it. It's the Phase-2 "useful kiosk" with knobs
on.

**Hardware lineage:** Surface Pro 5 → SP5 LCD died May 2026 → ThinkPad X230
(current). The dock is the *intended endgame* box — a purpose-built Pi 5
enclosure to replace the laptop-on-the-wall. `chota.service` and the deploy
pipeline are hardware-agnostic (only `/etc/hostname` cares), so moving onto the
Pi is a deploy target swap, not a rewrite. The plan already anticipated this:
see `docs/plan.md` §"Kiosk mode" ("SvelteKit + adapter-node + agent-browser all
run on a Raspberry Pi 5 … the SP5 can be swapped for a cheaper Pi-and-screen
later — nothing in the stack is tied to the Surface").

## The bill of materials (what was ordered, and what each part is *for*)

| Part | Qty | Role in the dock |
|---|---|---|
| **Raspberry Pi 5 Model B 4GB** (CE09785) | 1 | The brain. Runs the chota SvelteKit app + drives both screens. |
| **Pi 5 Active Cooler** (CE09791) | 1 | Pi 5 runs hot in a closed box. Mandatory, not optional. |
| **Pi 5 Official 27W USB-C PD PSU** (CE09787) | 1 | 5.1V / 5A. Powers the Pi *and* both DSI screens (they tap GPIO 5V). |
| **Raspberry Pi Pico 2 W H** (CE10155) | 1 | **The I/O brain for the front panel.** Reads every dial/switch/button and reports to the Pi over USB. The crux of the design — see below. |
| **Rotary Potentiometer 10k linear** (COM-09939) | 2 | The **dials**. Analog. Kid turns one to scroll a menu / pick an option. |
| **Encoder Module w/ Button** (CE09436) | 1 | A *detented* dial with push-to-select. Better than a pot for stepping through a discrete list (clicks per item) + click-to-confirm. |
| **Mini Panel-Mount SPDT Toggle** (ADA3221) | 3 | **Mode switches.** e.g. who-am-I (kid1/kid2/kid3), or category (stories/puzzles/facts). |
| **Toggle Switch** (COM-09276) | 1 | Master / power-feel switch, or a 4th mode bit. |
| **30mm Arcade Button w/ LED, red** (ADA3489) | 1 | **The big PRINT button.** LED pulses when ready, lights on press. The whole UX climaxes here. |
| **Diffused 10mm LED pack, 5 colours ×5** (ADA4204) | 25 | Panel indicators — mode lights, "printing…", "ready", per-dial position. |
| **Brass M2.5 standoffs 16mm** (ADA2337) | 2×2 | Mount the Pi / Pico / perfboard off the box floor. |
| **400-pt breadboard** (CE05102) | 1 | Prototype the panel wiring before committing to solder/perfboard. |
| **Jumper wires** M-F / F-F / breadboard (CE07069/70, CE00301) | — | Wiring. |

What the BOM is *telling us*: there's a Pi **and** a Pico, plus two **analog**
potentiometers. That combination is the whole architecture (next section).

## The key architectural insight: the Pico is the panel's I/O brain

**The Pi 5 has no analog inputs.** None. The two 10k potentiometers are analog
(wiper voltage 0–3.3V) and cannot be read by the Pi directly — it has no ADC.

**The Pico 2 W does have an ADC** (3 usable channels on GP26/27/28). So the
division of labour is obvious and clean:

```
  ┌─────────────────── FRONT PANEL ───────────────────┐
  2× pot ─(analog)─┐                                   │
  encoder + btn ───┤                                   │
  4× toggle ───────┼──►  Pico 2 W  ──USB serial──►  Pi 5
  arcade btn ──────┤   (reads, debounces,         (Node app)
  LEDs ◄───────────┘    streams JSON events)
  └────────────────────────────────────────────────────┘
```

The **Pico** owns all the messy real-world wiring: it reads the two pots on its
ADC, the encoder + toggles + arcade button on GPIO, debounces everything, drives
the indicator LEDs, and streams compact JSON-line events to the Pi over **USB
(CDC serial)**. One USB cable carries data *and* powers the Pico.

The **Pi** stays clean: no analog hardware bolted to its GPIO (the only GPIO use
is the two-pin 5V tap each Touch Display 2 needs for backlight power), it just
reads `/dev/ttyACM0` and reacts. This also means the panel firmware is
independently flashable/iterable (MicroPython or Arduino-C on the Pico) without
touching the chota app, and a wiring short on the panel can't brick the Pi.

**Firmware shape (Pico):** MicroPython is the fast path. Poll ADCs + pins at
~50Hz, debounce, and `print()` a JSON line on any change:

```json
{"dial1": 0.42, "dial2": 0.0, "enc": 3, "encBtn": false,
 "sw": [true,false,false,false], "print": true}
```

The Pi reads these lines, maps them to UI state + actions. `print: true`
(arcade button) is the trigger to fire `POST /api/print/<kind>`.

## The two screens — recommendation

This is the question you asked. Short answer: **two official Raspberry Pi Touch
Display 2 panels, both on DSI** — 7" up top, 5" down below.

### Why the Touch Display 2 line fits perfectly

As of the late-2024 refresh the official **Touch Display 2 comes in both 7" and
5"**, and *both are 720×1280 IPS, capacitive, DSI*. That's almost suspiciously
on-the-nose for this build:

- **Driverless + official.** No device-tree hacking, no vendor kernel modules —
  Raspberry Pi OS just lights them up. Long-term maintainability matters for a
  box the family depends on every morning.
- **Pi 5 natively supports *two* of them.** The Pi 5 has **two DSI/CSI
  connectors** (the pair of 22-pin FFC sockets). Official docs confirm a Pi 5 /
  CM can drive two Touch Display 2s simultaneously.
- **Two cables each, both trivial.** Each panel = one DSI ribbon (Pi 5 uses the
  supplied **22-way→15-way FFC adapter**) + a **two-pin 5V tap off the GPIO
  header** for the backlight. Both panels share the Pi's 5V/GND rails. No
  separate display PSU, no HDMI adapters.
- **Touch is a free bonus.** The top screen is mostly ambient, but capacitive
  touch means "tap the clock to go home" still works. The bottom screen doesn't
  *need* touch (the dials drive it) — but it comes with it anyway.

### The screens, mapped

| | Top (lid) | Bottom (base panel) |
|---|---|---|
| Panel | **Official 7" Touch Display 2** | **Official 5" Touch Display 2** |
| Native res | 720×1280 portrait | 720×1280 portrait |
| Mounted | **rotated to landscape** 1280×720 in the lid | rotated to landscape 1280×720 behind the dials |
| Shows | `/clock`, weather, photo — ambient | a new `/dock` route — reacts to the panel |
| Driven by | nothing / occasional touch | the Pico's dials + switches |
| Connector | DSI-1 across the hinge (see risk) | DSI-0, short internal ribbon |

Both rotate to landscape via `display_rotate` / a Wayland output transform —
720×1280 → 1280×720 is a crisp small landscape status screen.

### The one real engineering risk: the hinge

The lid opens, so the **top screen's cable crosses a hinge that flexes daily.**
DSI is a flat **FFC ribbon**, and FFC does *not* love repeated flexing — it can
crack at the fold over months. This is the part to get right.

Mitigations, in order of preference:

1. **Mount the Pi in the BASE; run only the lid screen's cable across the
   hinge.** Everything else (5" screen, Pico, all controls) stays in the base on
   short internal cables. Exactly **one** cable crosses the hinge — minimise the
   failure surface.
2. **Use a long *flexible* DSI FPC cable** (Waveshare/Pimoroni sell 200–500mm
   DSI flex cables) with a **generous service loop**, routed *through the hinge
   barrel / along the rotation axis* so it twists gently rather than sharp-folds.
   Strain-relief both ends. This is how Pi-laptop builds run DSI to a lid; it's
   proven but demands care.
3. **Fallback if the flexing DSI worries you: make the lid screen HDMI instead.**
   A 7" HDMI IPS panel (e.g. 1024×600 or 1280×800) + a flexible micro-HDMI cable
   + a 5V power wire tolerate hinge flexing far better than DSI FFC. You lose
   "official + touch + single-ribbon-tidiness" but gain mechanical robustness.
   Keep the **5" on DSI** in the base regardless.

**Recommendation:** start with **option 1 + 2** (both official Touch Display 2,
Pi in the base, flexible DSI + service loop to the lid). If a cracked ribbon ever
bites, the swap to **option 3** for the lid screen is a cable + panel change, not
a redesign. Buy a spare DSI flex cable up front — they're a few dollars and it's
the one consumable in the build.

### Why not the alternatives

- **Both on HDMI** — works (Pi 5 has two micro-HDMI), rock-solid, but: two
  micro-HDMI adapters, two screens each needing their own 5V injection, bulkier
  stiffer cables inside a small box. Tidiness loss with no real upside now that
  the official 5" DSI exists. (HDMI stays the right call *only* for the lid, and
  only if you reject flexing DSI.)
- **Non-touch generic SPI screens** — too small/slow (SPI refresh is laggy), and
  you'd be writing framebuffer code. The whole point is reusing the existing
  SvelteKit routes in a browser; that wants a real framebuffer display.
- **One big screen + no bottom screen** — loses the entire "kids operate a
  physical panel" concept. The two-screen split (ambient up, interactive down) is
  the idea.

## Software wiring — how chota drives all this

Nothing here breaks the existing single-process SvelteKit model.

**1. Serial listener (server).** A small boot-time listener (in
`hooks.server.ts` or a `src/lib/server/` module, gated behind a `DOCK=true` env
like the existing `KIOSK=true`) opens `/dev/ttyACM0` with the `serialport`
package, parses the Pico's JSON lines into a `PanelState`, and:
- pushes state to the bottom screen over **SSE** (or a WebSocket) so `/dock`
  updates live as dials turn;
- on the arcade-button edge, maps the current `PanelState` → a print kind and
  calls the existing print path (`POST /api/print/<kind>`), then flashes the
  "printing…" LED via a write back down the serial line.

This is conceptually a new **tool/peripheral**, not a new framework — same shape
as the printer transport already in `src/lib/server/print/`.

**2. Two kiosk browser windows.** Top screen = Chromium kiosk on `/clock` (or
auto-cycling ambient routes). Bottom screen = a second Chromium window on a new
**`/dock`** route. On Pi OS (Wayland/labwc) you place one kiosk window per
output (`--window-position` / per-output app windows). Same `--kiosk` recipe the
plan already specs in §"Kiosk mode", just two instances pinned to two outputs.

**3. The `/dock` route (new).** A Svelte page that subscribes to the panel SSE
stream and renders the current selection big and legible: which category the
toggles picked, which item the dial is on, a preview of what'll print, and a
"press the button" prompt. Pure presentation over `PanelState` — no new
backend logic beyond the serial listener. This is the one genuinely new UI
surface; everything it *prints* already exists.

**Mapping panel → print, first cut:**
- 3× SPDT toggles → pick a **category** (e.g. story / puzzle / brief) — or
  who-it's-for (kid1/2/3).
- Dial / encoder → **scroll within** that category's items, bottom screen shows
  the current pick.
- Arcade button → **print it.** LED ready→pressed→printing→ready.
- The 4th toggle → a global mode (e.g. "answers on/off" for puzzles, or
  silent/normal).

Start dead simple (toggles = category, encoder = item, button = print) and grow
the mapping once kids actually use it.

## Power budget (sanity check)

The 27W (5.1V/5A) official PSU comfortably covers it:

- Pi 5 under normal load: ~1.5–2.5A
- Two Touch Display 2 backlights: ~1A combined (off the GPIO 5V rail)
- Pico over USB: ~0.1A
- A handful of 10mm LEDs lit (~10mA each): <0.1A

Well under 5A. Two notes:
- Set `usb_max_current_enable=1` (valid with the 27W PSU) so USB isn't capped at
  600mA — relevant if anything power-hungry hangs off USB.
- **The thermal printer keeps its own mains brick.** Thermal heads pull
  multi-amp bursts while printing; never run it off the Pi's 5V. It connects to
  the Pi as a **USB data** device only (as it does today on the X230). The Pico
  and printer are both just USB devices to the Pi.

## The enclosure

- **Base** holds the Pi 5 (on standoffs, active cooler clear of obstructions),
  the Pico + panel wiring (breadboard first, perfboard once the layout's
  settled), the 5" screen behind a front cutout, and the dial/switch/button
  panel. Drill the front face for the two pots, encoder, four toggles, the 30mm
  arcade button, and the indicator LEDs.
- **Lid** holds only the 7" screen, angled. One DSI flex (+ its GPIO 5V pair)
  runs down through the hinge to the base.
- **Thermal printer**: either a third cutout/slot in the base for the paper to
  feed out (printer inside) or it sits beside the box (printer external, USB +
  its own brick). Inside is tidier but adds heat + paper-loading access needs;
  decide once you have the printer's dimensions vs the box.
- **Ventilation**: the Pi 5 active cooler needs airflow. Vent slots near the
  cooler intake/exhaust; don't seal it in a wooden coffin.

## What's *not* in the box yet (shopping gaps)

The order is the electronics core but a few things finish the build:

- **2× official Touch Display 2** (7" + 5") — *the screens themselves aren't in
  this order.* This is the main buy.
- **A spare long flexible DSI FPC cable** for the hinge run (+1 spare).
- **microSD card** (or NVMe HAT + SSD) for the Pi 5 OS — note an NVMe HAT may
  fight the active cooler / DSI cable routing for space; SD is the simple start.
- **Panel knobs** for the pot/encoder shafts (kid-friendly, grippy).
- **Hookup wire / perfboard** for the permanent panel (breadboard is prototype
  only — a box that gets carried around will shake breadboard jumpers loose).
- **Resistors** for the indicator LEDs (≈220–330Ω each) and the arcade button
  LED — the LED pack doesn't include current-limiting resistors.

## Phasing (don't build it all at once)

1. **Bring-up on the bench.** Pi 5 boots chota, one Touch Display 2 on DSI shows
   `/clock`. Proves the app runs on the Pi (it should — adapter-node + agent-
   browser are ARM-fine).
2. **Second screen.** Add the 5" on DSI-0, get two kiosk windows on two outputs.
3. **Pico panel on breadboard.** Wire the two pots + arcade button + one toggle,
   flash MicroPython, stream JSON, watch it in `/admin/logs`. Build the
   serial→SSE→`/dock` path. Print from the button.
4. **Full panel.** All switches/dials/LEDs, mapping finalised, move to perfboard.
5. **Box it.** Cut the wood, mount screens, solve the hinge cable, vent it.
6. **Deploy swap.** Point the deploy pipeline at the Pi's hostname; retire the
   laptop-on-the-wall.

Each step is independently useful and testable — classic Chota "joy + actually
finishes" pacing.

## Open questions

- **Pi in base vs lid?** Recommending base (one cable across the hinge). Revisit
  if lid-mounting the Pi makes the 7" DSI run trivially short and you'd rather
  cross the hinge with the *Pico's USB* (very flex-tolerant) + the 5"'s cable.
- **Encoder vs pots for item selection.** The detented encoder is better for
  discrete menus (one click = one item, click-to-confirm); the pots suit
  continuous/analog feel ("dial brightness", "how many jokes"). Likely use the
  encoder for menus and the pots for a parameter each — decide once the print
  menu's shape on `/dock` is real.
- **Touch on the bottom screen** — comes free; ignore it for now (dials are the
  interface) but it's there if a hybrid touch+dial UX emerges.
- **Printer in or beside the box** — depends on the MUNBYN's footprint vs the box
  you build.

## Where this connects to the rest of the docs

- `docs/plan.md` §"Kiosk mode" / §"Phase 2" — this dock *is* the Phase-2 useful
  kiosk, given a body. The print catalogue it drives is specced there.
- `docs/printers.md` — the thermal printer stays a USB-data device with its own
  power; Linux/CUPS gotchas apply unchanged on the Pi.
- `docs/jobs.md` — the morning print job is unchanged; the dock adds *on-demand*
  prints triggered by the button, not new scheduled jobs.
- `chota.config.ts` — when the panel→print mapping firms up, the category/item
  lists likely become a typed `dock` config block (which toggle = which
  category, which kinds are dial-selectable), same pattern as everything else.
