# Dial — physical print controller

**Status: planned, pre-implementation.** A small, cool-looking USB control panel — a rotary dial + a couple of buttons + (later) a wall-mounted e-ink screen — that lets anyone walk up, spin to a choice, click, and have the thermal printer fire. No phone, no dashboard, no login. Walk-up-and-print.

This doc captures the decisions so that when we build it the choices are pre-made. It mirrors the structure of [`telegram.md`](telegram.md): decisions first, alternatives second, then sketches.

## What we're building

```
   ┌─────────────────────┐
   │   ◌ e-ink (later)    │   menu drawn here:
   │   > Kid1 today       │     dial scrolls the cursor
   │     Kid2 today       │     A = select/print
   │     Family sheet     │     B = back / day-toggle
   │     Test ruler       │
   │   [ ● ]   A    B     │   dial + 2 buttons
   └─────────────────────┘
            │ USB
            ▼
       chota box (X230)  →  composeImage(kind) → printPng() → MUNBYN
```

A wall-mounted panel: a knob you twist to move a cursor through a short menu of "what to print", a primary button to select-and-print, and a secondary button for back / today↔tomorrow. The e-ink shows the current menu so you don't need the dashboard. Lands in phases — the dial+buttons→print loop first, the physical screen last.

The whole point: chota already has a clean programmatic print path. The dial is just a third trigger alongside the cron jobs and the `/admin/print` buttons.

```ts
import { getPrintKinds } from '$lib/server/print/composers';
import { composeImage } from '$lib/server/print/composers';
import { printPng } from '$lib/server/print/printer';

const img = await composeImage('kid1');   // screenshot of /print/kid1 (canvas fallback)
await printPng(img!.image);               // ESC/POS raster over USB, returns bytes
```

So the new surface area is: **read the knob, walk a menu of `getPrintKinds()`, call those two functions on click.** Everything downstream already exists and is tested.

## Decisions

- **Transport: Raspberry Pi Pico (RP2040) over USB serial (CDC), not HID.** The Pico runs tiny firmware that reads a rotary encoder + buttons and emits line-oriented text events (`ROT +1`, `BTN A`, …) over a virtual serial port. chota reads it with [`serialport`](https://serialport.io). Why serial over HID:
  - **Bidirectional.** HID knobs are one-way (they pretend to be a keyboard). We need the *host* to push menu state *back* to the device so the same board can drive the e-ink. Serial is a clean two-way pipe.
  - **No keystroke leakage.** An HID keyboard device injects keypresses into whatever has focus — on a kiosk that's a footgun. Serial events only reach the process that opens the port.
  - **Full control of the input vocabulary.** Detents, long-press, double-click, button combos — all defined in firmware, not constrained by the HID consumer-control page.
  - **One board does input + display.** The Pico reads the encoder *and* drives the e-ink SPI panel. One USB cable, one device, one firmware.
- **Firmware is dumb; chota owns all menu logic.** The Pico does not know what "Kid1" is. It sends raw input events up, and renders whatever text frame the host sends down. The menu (which print kinds, their labels, their order, today/tomorrow state) lives entirely in chota TypeScript — so adding a print format means it shows up on the dial with zero firmware changes. See [§Serial protocol](#serial-protocol).
- **CircuitPython firmware.** Adafruit's `rotaryio` + `keypad` + `displayio` make the encoder/button/e-ink trivially short (~80 lines). MicroPython is the fallback if a specific e-ink panel only ships a MicroPython driver. Arduino/C is overkill for a device whose only job is shuttling bytes. We are not latency-bound.
- **Lives as a long-running service inside the chota process, gated by `KIOSK`.** Same pattern as the cron jobs: a `bootDial()` started from `hooks.server.ts`, only when the `KIOSK` env var is set (so dev machines and CI never try to open a serial port). A `stopDial()` on SIGTERM closes the port cleanly. This keeps it in-process with `composeImage`/`printPng` — no second daemon, no IPC.
- **Menu is derived, not hand-maintained.** Built from `getPrintKinds()` at boot, with optional per-kind display labels + ordering + grouping from config. New print format → new menu entry for free.
- **e-ink is Phase D and optional.** During bring-up the menu is mirrored on a new `/admin/dial` web page (and a keyboard simulator), so the entire dial→print loop is buildable and demoable *before any hardware exists* and the physical screen can land last.

## Hardware

### Parts list (indicative, ~A$45 + printer already owned)

| Part | Example | ~Cost | Notes |
|---|---|---|---|
| MCU | Raspberry Pi Pico (RP2040) or Pico 2 | A$7 | Any board CircuitPython supports works; Pico is cheapest + ubiquitous. A `-W` buys nothing here (we're USB-tethered to the box). |
| Rotary encoder | EC11 with push-switch + detents | A$3 | Detented = satisfying menu clicks. The integral push-switch becomes "select" so you *can* drive everything with one knob. |
| Knob | Aluminium machined knob, 6mm D-shaft | A$8 | The "cool looking" budget. A heavy knurled knob is most of the perceived quality. |
| Buttons | 2× mechanical keyswitch (Cherry/Gateron) or arcade microswitch | A$6 | Keyswitches feel premium; arcade buttons read more "appliance". Either is fine. |
| e-ink (Phase D) | Waveshare 2.13" or 2.9" SPI, B/W | A$18 | B/W only — color e-ink refresh is too slow for a menu cursor. 2.9" = roomier menu. Partial refresh support matters (see §Display). |
| Enclosure | 3D-printed faceplate + single-gang wall box | — | Mounts in-wall like a light switch. Faceplate hosts knob + buttons + e-ink window. |

### Wiring (CircuitPython pin names, Pico)

```
EC11 encoder   A → GP16,  B → GP17,  switch → GP18 (+ GND)
Button A       → GP19 (+ GND)        # select / print
Button B       → GP20 (+ GND)        # back / day-toggle
e-ink (SPI)    SCK → GP10, MOSI → GP11, CS → GP9, DC → GP8, RST → GP12, BUSY → GP13
```

All buttons use internal pull-ups (`keypad` handles debounce). Encoder via `rotaryio.IncrementalEncoder` (quadrature decode in hardware-ish, no missed steps).

### USB identity

The Pico's CDC serial port shows up as `/dev/ttyACM0` (Linux) with Pico's USB VID/PID `2E8A:000A` (CircuitPython) or `2E8A:0005` (raw). chota finds the port by VID/PID match rather than a hard-coded device path, so a replug or a second ACM device doesn't break it. Confirm with `lsusb` / `ls /dev/ttyACM*` exactly as the printer IDs were confirmed (see [`printers.md`](printers.md)).

## Serial protocol

Line-oriented ASCII, `\n`-terminated, 115200 baud. Human-readable so it's debuggable with `cat /dev/ttyACM0` and `screen`. Two channels over the one port:

### Device → host (input events)

```
HELLO dial v1            # sent on boot/connect — host replies with a full frame
ROT +1                   # one detent clockwise
ROT -1                   # one detent counter-clockwise
BTN A                    # primary button pressed (select / print)
BTN B                    # secondary button pressed (back / day-toggle)
BTN A LONG               # long-press (≥600ms) — reserved (e.g. reprint last)
BTN ENC                  # encoder shaft push — alias for BTN A
```

Encoder deltas are sent per-detent (`+1`/`-1`), not as an absolute count — the host owns the cursor position, so a missed event never desyncs the menu past one row, and the next full frame re-syncs the display anyway.

### Host → device (display frames)

The host sends the *entire* screen state on every change (idempotent, stateless device). Firmware just renders it. Compact, fixed grammar:

```
FRAME
TITLE What to print
ROW 0 > Kid1 — today
ROW 1   Kid2 — today
ROW 2   Family sheet
ROW 3   Test ruler
STATUS idle
END
```

- `ROW n <text>` — one menu line; the host bakes the `>` cursor into the chosen row's text (device draws verbatim, no cursor logic in firmware).
- `STATUS <word>` — drives a small status glyph/footer: `idle` | `printing` | `done` | `error` | `busy`.
- The device redraws on `END`. On e-ink, the host can prefer **partial refresh** for cursor moves (fast, slight ghosting) and force a **full refresh** only on `STATUS` changes (clean) — encoded as `FRAME!` vs `FRAME` if we want to be explicit later.

This keeps the firmware a ~80-line dumb terminal and means *all* menu/label/grouping changes are TypeScript-only.

## chota-side design

New module folder `src/lib/server/dial/` (server-only, alongside `jobs/`, `print/`):

```
src/lib/server/dial/
  index.ts        # bootDial() / stopDial() — opens serialport, wires events, KIOSK-gated
  serial.ts       # port discovery (VID/PID), line framing, write(frame), reconnect/backoff
  menu.ts         # buildMenu() from getPrintKinds() + config labels; pure, unit-testable
  controller.ts   # the state machine: cursor + day-toggle + handleEvent() → actions
  protocol.ts     # encode FRAME / parse input lines — pure, the heart of the tests
  simulator.ts    # a fake transport (keyboard / web) for dev with no hardware
```

### Boot wiring (mirrors the scheduler)

```ts
// hooks.server.ts (sketch — next to bootJobs())
import { bootDial, stopDial } from '$lib/server/dial';
if (process.env.KIOSK) await bootDial();          // dev/CI never opens a port
process.on('SIGTERM', () => { stopJobs(); stopDial(); });
```

### Menu model

```ts
// menu.ts
export interface MenuItem {
  kind: string;          // a value from getPrintKinds(): 'kid1' | 'family' | 'test' | …
  label: string;         // display text: 'Kid1', 'Family sheet', 'Test ruler'
  day?: 'today' | 'tomorrow';   // day-toggle applies to recipient kinds, not 'test'
}
export function buildMenu(): MenuItem[];   // derives from getPrintKinds() + config.dial.labels
```

### Controller state machine

```
        ROT ±1                 BTN A (select)
 idle ──────────► idle    idle ───────────────► printing
 (move cursor)               │                      │ composeImage(kind, {day})
                             │                      │ printPng(img.image)
 BTN B at idle:              │                      ▼
   toggle today/tomorrow     │            done ──(2s timeout)──► idle
   on the cursor row     printing ──(printer busy / throw)──► error ──(2s)──► idle
```

- **Debounce / re-entrancy:** the printer driver already holds a process-level mutex and throws if busy; the controller maps that to `STATUS busy`, never queues a second job, and ignores further `BTN A` while `printing`.
- **Every transition emits a full `FRAME`** to the device (and to the web mirror), so display and logic can't drift.
- **Logging:** one wide `event('dial', 'dial print {kind}', { kind, day, bytes })` per print via the existing LogTape helper (see [`logging.md`](logging.md)), so dial prints show up in `/admin/logs` next to the cron prints.

### Config additions

Add an optional typed block to `ChotaConfig` (`src/lib/config.ts`) — same pattern as `printer` / `telegram`, no JSON, no zod:

```ts
/** Physical dial controller (Pico over USB serial). Omit to disable. */
dial?: {
  /** Match the Pico's USB serial by VID/PID (preferred over a device path). */
  vendorId?: number;    // 0x2E8A (Raspberry Pi)
  productId?: number;   // 0x000A (CircuitPython CDC)
  /** Explicit device path override, e.g. '/dev/ttyACM0'. Optional. */
  path?: string;
  /** Per-kind display labels + order. Kinds not listed fall back to a humanised
   *  version of the kind, in getPrintKinds() order. */
  menu?: { kind: string; label: string }[];
};
```

…and fill it in `chota.config.example.ts` with placeholder labels (`Kid1`, `Kid2`, `Family sheet`, `Test ruler`) per the **no-real-names** rule.

### Dependency

`serialport` (npm) — actively maintained, prebuilt binaries for arm64/x64 Linux (no node-gyp pain), used by countless kiosks. It's a native addon like `better-sqlite3`/`usb`, which the project already ships, so the deploy story is unchanged.

## Dev story — buildable before any hardware

The whole loop is testable with **zero hardware**, which is why Phase A can land and be demoed immediately:

1. **Pure-unit tests** (vitest, the project's 105-test suite style): `protocol.ts` encode/parse round-trips, `menu.ts` derivation, and the `controller.ts` state machine driven by synthetic events — assert the emitted `FRAME`s with inline snapshots, exactly like the print-format tests.
2. **Web simulator** at `/admin/dial`: renders the live `FRAME` the controller would send to the e-ink, with on-screen ⟲ / ⟳ / A / B buttons (and ←/→/Enter keyboard bindings) feeding the same `controller.handleEvent()`. This *is* the bring-up UI and stays useful forever as a remote control + the e-ink WYSIWYG preview.
3. **Loopback transport:** `simulator.ts` implements the same transport interface as `serial.ts`, so `bootDial()` runs identically against a fake port. Swapping in the real Pico is a one-line transport switch.

## Firmware sketch (CircuitPython)

Not for use as-is — anchors the shape. ~80 lines total.

```python
import board, busio, usb_cdc, rotaryio, keypad
# import + init the e-ink displayio driver for the chosen Waveshare panel

serial = usb_cdc.console            # or usb_cdc.data with a boot.py enabling it
enc = rotaryio.IncrementalEncoder(board.GP16, board.GP17)
keys = keypad.Keys((board.GP18, board.GP19, board.GP20), value_when_pressed=False, pull=True)
# index 0 = encoder switch (→ BTN A), 1 = button A, 2 = button B

def send(line): serial.write((line + "\n").encode())

send("HELLO dial v1")               # host responds with the first FRAME
last = enc.position
rows, title, status = [], "", "idle"

while True:
    pos = enc.position
    if pos != last:
        send("ROT +1" if pos > last else "ROT -1")   # one event per detent
        last = pos
    ev = keys.events.get()
    if ev and ev.pressed:
        send(("BTN A", "BTN A", "BTN B")[ev.key_number])

    # drain inbound FRAME…END, then render rows/title/status to the e-ink
    if serial.in_waiting:
        line = read_line()
        if line == "FRAME": rows, title = [], ""
        elif line.startswith("TITLE "): title = line[6:]
        elif line.startswith("ROW "):  rows.append(line.split(" ", 2)[2])
        elif line.startswith("STATUS "): status = line[7:]
        elif line == "END": draw(title, rows, status)   # partial refresh on cursor moves
```

## Phasing

| Phase | Deliverable | Hardware needed |
|---|---|---|
| **A** | `dial/` module: protocol + menu + controller + tests + **web simulator** at `/admin/dial`. Full dial→print loop, demoable. | none |
| **B** | Pico firmware (input only) + `serial.ts` real transport + `dial` config block. Knob + buttons physically print. | Pico, encoder, 2 buttons, breadboard |
| **C** | Polish: long-press reprint-last, today/tomorrow toggle UX, status glyphs, reconnect/backoff hardening. | same |
| **D** | e-ink: firmware render path + host `FRAME` partial/full-refresh tuning. Wall enclosure + mount. | + Waveshare e-ink, faceplate, wall box |

Phase A is the only one with no external dependency and delivers the entire logic surface — so it's the natural first PR. B–D each add a thin physical layer over an already-tested core.

## Considered alternatives (and why not)

| | Verdict | Why |
|---|---|---|
| **Off-the-shelf USB HID knob** (volume knob / macropad) | Skip | Zero firmware, but one-way only (can't drive the e-ink), injects keystrokes into the focused window on the kiosk, and locks the input vocabulary to the HID consumer page. Dead-ends at Phase D. |
| **`node-hid` + custom HID descriptor on the Pico** | Skip | Buys nothing over CDC for our needs and is fiddlier (report descriptors, raw report parsing) than line-oriented serial. Serial is `cat`-debuggable. |
| **Pico drives the printer directly** (cut chota out) | Hard skip | Then the menu/format logic lives in firmware, duplicating `composeImage` and losing screenshots, fonts, weather, the lot. chota *is* the print brain; the dial is an input device. |
| **GPIO encoder straight into the X230** | Skip | The ThinkPad has no GPIO header. USB is the only sane physical-input bus on a laptop kiosk — which is exactly the Pico's job. |
| **Arduino/C firmware** | Skip | CircuitPython's `rotaryio`/`keypad`/`displayio` make this ~80 lines; we're nowhere near needing C's performance. Reserve as fallback only if a panel lacks a CP driver. |
| **Color e-ink** | Skip (for now) | Multi-second full refreshes make a cursor feel broken. B/W with partial refresh is the right feel for a menu. |
| **Second standalone daemon for the dial** | Skip | Would need IPC back to `composeImage`/`printPng`. In-process under `KIOSK` (like the cron jobs) is simpler and shares the printer mutex for free. |

## Risks / open questions

- **Serial reconnect.** USB replug / box reboot / Pico brownout must recover without a chota restart — `serial.ts` needs VID/PID re-discovery + exponential backoff (reuse the deploy/push backoff shape). Tracked for Phase B.
- **e-ink refresh feel.** Partial refresh ghosts; full refresh flashes. Need to tune which transitions use which (proposal: partial on cursor move, full on `STATUS` change). Validate on real glass in Phase D.
- **`usb_cdc.data` vs `console`.** Using the CircuitPython REPL console as the data channel is simplest but mixes with tracebacks; a dedicated `usb_cdc.data` channel (enabled in `boot.py`) is cleaner. Decide in Phase B.
- **Power / enumeration order.** If the Pico and the MUNBYN both enumerate at boot, confirm `/dev/ttyACM*` vs the printer's `usb` libusb claim don't contend (they shouldn't — different drivers, different devices). Verify on the X230.
- **Physical mount.** In-wall single-gang box depth vs Pico + e-ink ribbon clearance — measure before printing the faceplate.

## Where this plugs into what exists

- **Print path:** `composeImage()` + `printPng()` in [`print/`](../src/lib/server/print/) — unchanged, just a new caller.
- **Boot/lifecycle:** mirrors `bootJobs()`/`stopJobs()` in [`scheduler.ts`](../src/lib/server/scheduler.ts), wired from `hooks.server.ts`, gated by `KIOSK`.
- **Config:** new optional `dial` block in [`config.ts`](../src/lib/config.ts), example in `chota.config.example.ts`.
- **Logging:** `event('dial', …)` via [`log.ts`](../src/lib/server/log.ts), visible at `/admin/logs`.
- **Admin:** new `/admin/dial` page (simulator + live frame mirror), alongside `/admin/print`.
