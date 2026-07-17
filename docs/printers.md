# Printers

Notes on thermal printers we've shipped against. Each printer gets its own section. Shared architecture + ESC/POS notes are at the top so per-printer sections can stay small.

## Thermal printers 101

Receipt-style thermal printers are intentionally dumb:

- **1–3 built-in fonts.** Usually a default font (~A) and a smaller variant (~B). No anti-aliasing. No font loading. Bold + double-height/double-width are bit-flag flags on the same glyphs.
- **Fixed-width characters per line** at default font: 80mm rolls = ~48 chars; 58mm rolls = ~32 chars. This is the single most useful number to know when designing print layouts.
- **ASCII-safe is safest.** Default code page is PC437 / WPC1252; if you stick to ASCII you don't have to think about encoding. `°C` becomes `?C`; just write `C`.
- **No layout.** No CSS, no padding, no flow. You're emitting bytes that move a print head. Spaces and `\n` are your layout.
- **They speak ESC/POS** (an ancient Epson byte protocol). Bold on = `1B 45 01`, cut = `1D 56 00`. Libraries hide this; sometimes you need it raw.
- **USB transport, mostly.** Some have Bluetooth or Ethernet. We've only used USB.

Because the built-in fonts are so basic, **anything visually richer than monospace text needs to go through the image path:** render HTML to a PNG at the print-head's pixel width (576px for 80mm @ 203dpi), 1-bit dither (Floyd–Steinberg), then send as a raster image. We do this for the morning brief — see `src/lib/server/print/snapshot.ts` (the HTML→PNG via `agent-browser`) and `printer.ts > printImageBuffer` (the raster send).

## Architecture: two-layer

**`node-thermal-printer` builds bytes, `usb` package sends bytes.**

- `node-thermal-printer` has NO USB transport — only TCP / file (Linux `/dev/usb/lpX`) / system-printer (CUPS). Don't pass `interface:` when using it for buffer building (we use a dummy `tcp://localhost:0` only because the constructor demands one).
- `usb` package (libusb) does the actual USB transfer.

`src/lib/server/print/printer.ts` ties them together.

## Public API

```ts
// Simple text print (most common — used by morning-print job)
import { printText } from '$lib/server/print/printer';
await printText((await composeText('morning'))!);

// Image print — what the production morning print actually uses
import { printPng } from '$lib/server/print/printer';
await printPng(pngBuffer);

// Lower level: build with node-thermal-printer's full API, includes images
import { printReceipt } from '$lib/server/print/printer';
await printReceipt(async (p) => {
	p.alignCenter().bold(true);
	p.println('CHOTA');
	p.bold(false).alignLeft();
	p.println(headerText);
	await p.printImage('./data/dithered.png');
	p.println(footerText);
	p.cut();
});
```

The callback receives the node-thermal-printer instance — full access to its API (alignment, bold, barcodes, QR, dithered images). Buffer is built then sent in one transfer.

A process-level mutex prevents two prints racing on the same USB endpoint. Concurrent calls throw — caller catches and tries on next tick.

## ESC/POS commands worth knowing

| Bytes                        | Meaning                    | When                           |
| ---------------------------- | -------------------------- | ------------------------------ |
| `1B 40` (`ESC @`)            | Initialize                 | Start of every payload         |
| `1B 61 00/01/02` (`ESC a n`) | Align left/center/right    | Headers, footers               |
| `1B 45 01/00` (`ESC E n`)    | Bold on/off                | Emphasis                       |
| `1D 56 00` (`GS V 0`)        | Full cut (paper severed)   | When you want clean separation |
| `1D 56 01` (`GS V 1`)        | Partial cut (small bridge) | Default — easy tear, no jam    |
| `1D 56 41 nn` (`GS V A n`)   | Feed `n` lines + full cut  | Extra space before tear        |
| `1B 64 nn` (`ESC d n`)       | Feed `n` lines             | Whitespace                     |

`node-thermal-printer` exposes these via `cut()`, `partialCut()`, `feed(n)`, etc.

## Smoke test

```bash
node scripts/printer-test.mjs visible    # check vendor/product IDs visible
node scripts/printer-test.mjs print      # 3-line print + cut
```

Uses raw ESC/POS bytes (no node-thermal-printer dependency) so it's the simplest possible round-trip — useful for diagnosing transport vs formatting issues.

## Hardening (in place)

Per Gemini review when we shipped the morning-print job:

1. **Try/finally around USB ops** — wrapper does this; `iface.release()` + `device.close()` always run
2. **Mutex** — module-level `busy` flag prevents overlapping prints (job tick can't double-fire)
3. **Chunking** — STM32 chips can have small receive buffers. If long payloads truncate, slice into 1KB chunks with 10ms gaps. Not seen yet; add if symptoms appear
4. **Character set** — `CharacterSet.PC437_USA` set in printer constructor; node-thermal-printer handles the encoding. Keep print content ASCII-only for safety (`C` not `°C`)

## Config shape (chota.config.ts)

```ts
printer?: {
  vendorId: number;       // USB vendor ID — varies per unit (see per-printer section)
  productId: number;      // USB product ID — varies per unit
  charsPerLine?: number;  // 48 for 80mm default font, 32 for 58mm
};
```

## Library choices

**`node-thermal-printer` for bytes** — broadest ESC/POS coverage, image dithering built in, decent docs.

**`usb` (libusb binding) for transport** — direct, no driver overhead, works on Mac (with kernel-driver detach) + Linux (no detach needed) + Windows (with WinUSB swap via Zadig).

**Images via `node-thermal-printer.printImage(path)`** — accepts PNG/BMP, downscales, dithers (Floyd–Steinberg), packs to 1-bit, embeds in the ESC/POS buffer. For high-quality dithering of _photos_, [`sharp`](https://github.com/lovell/sharp) gives more control: resize to 576px width (80mm @ 203dpi), greyscale, write Floyd–Steinberg yourself, send via `printer.printImageBuffer`. Defer until we have a real image to print.

---

# Printers we've shipped

## MUNBYN ITPP098P

USB thermal, 80mm rolls. **80mm @ default font = 48 chars per line** (use this when wrapping print text). The kit-on-hand uses STMicro generic USB IDs.

### USB IDs vary per unit

The blueprint says vendor `0x0416` product `0x5011`. The kit-on-hand (May 2026) is **`0x0483:0x5743`** — STMicro generic IDs. Many MUNBYNs share these because the manufacturer didn't flash a custom USB descriptor. Confirm yours:

```bash
node scripts/printer-test.mjs visible    # lists all USB devices, marks MUNBYN
ioreg -p IOUSB -l | grep -B 2 -A 20 printer-80   # macOS detail
```

Then put the IDs in `chota.config.ts > printer`:

```ts
printer: {
  vendorId: 0x0483,
  productId: 0x5743,
  charsPerLine: 48
}
```

### macOS specifics

- **Don't install the official MUNBYN driver** — it claims the device for CUPS, blocking direct USB
- **Don't add it as a printer in System Settings** — same reason. If it auto-added, delete it
- **`detachKernelDriver()` is a safety net** — our wrapper calls it if `isKernelDriverActive()` returns true. On the kit-on-hand it wasn't needed, but it'll save you on units where macOS gloms on harder
- **`lsusb` from Homebrew is unreliable** — use `ioreg -p IOUSB -l` or `system_profiler SPUSBDataType` instead

### Linux specifics (this is what the kiosk box runs)

- **libusb is statically linked into `node-usb@2.17+`** for `linux-x64` / `linux-arm64` prebuilds — nothing to apt-install. (`libusb-1.0-0-dev` is only needed if you're building `node-usb` from source on an unsupported arch, which we're not.)
- **udev rule** for non-root USB access — without this you'd get `LIBUSB_ERROR_ACCESS` and have to run chota as root:
  ```
  # /etc/udev/rules.d/99-munbyn.rules — also in deploy/
  SUBSYSTEM=="usb", ATTRS{idVendor}=="0483", ATTRS{idProduct}=="5743", MODE="0660", GROUP="plugdev"
  ```
  And the runtime user (`ko`) must be in `plugdev` — Pop!_OS doesn't auto-add: `sudo usermod -aG plugdev ko` (re-login to take effect).
- **CUPS will fight you for the device.** Pop!_OS / Ubuntu ship `cups` + `cups-browsed` enabled, and the kernel `usblp` module auto-binds to anything USB-class 0x07 (printer). When both are active, opening the printer from `node-usb` returns `LIBUSB_ERROR_BUSY` or silently does nothing. Two fixes (do both on the kiosk box):
  ```bash
  sudo systemctl disable --now cups cups-browsed
  echo 'blacklist usblp' | sudo tee /etc/modprobe.d/blacklist-usblp.conf
  # then unplug + replug, or reboot
  ```
- macOS-side: `detachKernelDriver()` covers the equivalent on that OS; on Linux with `usblp` blacklisted it's a no-op.

### Windows specifics

- **Zadig** — replace Microsoft's USB-printer driver with WinUSB; without this the `usb` package can't open the device
- Vendor/product IDs may differ — check Device Manager → Properties → Hardware IDs
