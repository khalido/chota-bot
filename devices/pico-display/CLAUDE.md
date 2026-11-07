# Project Context

A Raspberry Pi Pico W multi-app system with a Pimoroni 2" LCD display. Apps include a clock, countdown timer, pong game, and (planned) LLM chat. Built as a fun project with a kid.

## Architecture

Multi-app system with button A cycling between apps:

- **src/main.py**: Boot, WiFi/NTP, app switcher (button A via hardware IRQ)
- **src/app_clock.py**: Clock display with auto Sydney DST
- **src/app_timer.py**: Countdown timer with circular pie visualization
- **src/app_pong.py**: Single-player pong game
- **src/phttp.py**: Minimal HTTPS client (raw sockets, no dependencies)
- **src/llm.py**: OpenAI API wrapper using phttp.py
- **src/pico_utils.py**: Helper functions (filesystem info)
- **src/env.py**: WiFi + API credentials (gitignored)
- **src/env.template**: Template showing required env variables

## Project Structure

```
pi-pico-clock/
├── src/                   # Code that goes on Pico
│   ├── main.py           # Boot + app switcher
│   ├── app_clock.py      # App: Clock (auto DST for Sydney)
│   ├── app_timer.py      # App: Countdown timer
│   ├── app_pong.py       # App: Pong game
│   ├── phttp.py           # Minimal HTTPS POST client (socket + ssl)
│   ├── llm.py            # OpenAI chat completions wrapper
│   ├── pico_utils.py     # Helper functions
│   ├── env.py            # Secrets: WIFI_SSID, WIFI_PASSWORD, OPENAI_API_KEY (gitignored)
│   ├── env.template      # Template for env.py
│   └── quotes_gz/        # Hourly quote data (future use)
├── data/                 # Source data and analysis (not on Pico)
│   ├── quotes.json       # Source quotes
│   ├── quotes_gz/        # Compressed quote files
│   └── analysis.ipynb    # Analysis notebook
├── firmware/             # Firmware .uf2 files
├── README.md
└── CLAUDE.md
```

## Hardware

- **Raspberry Pi Pico W** (RP2040, 264KB SRAM, WiFi)
  - Upgrade path: **Pico 2W** (RP2350, 520KB SRAM) — drop-in replacement, same pinout
- **Pimoroni Pico Display Pack 2.0** (320x240 SPI LCD, 4 buttons, RGB LED)

## Button Layout (Physical)

```
┌─────────────────────────┐
│  [A]              [X]   │  A = top-left,  X = top-right
│                         │
│      320x240 LCD        │
│                         │
│  [B]              [Y]   │  B = bottom-left, Y = bottom-right
└─────────────────────────┘
```

| Button | GPIO | Role | Description |
|--------|------|------|-------------|
| **A** | 12 | Global | Cycle apps (hardware IRQ, always responsive) |
| **X** | 14 | Action | Start/pause, options (top-right) |
| **B** | 13 | Left | Move left, decrease values (bottom-left) |
| **Y** | 15 | Right | Move right, increase values (bottom-right) |

**Important**: Button A uses `machine.Pin` with IRQ (not `pimoroni.Button`) for instant response. Buttons B/X/Y use `pimoroni.Button` with polling.

## App Interface

Each app module exports two functions with module-level state (no classes):

```python
def init(display, buttons, led, colors, WIDTH, HEIGHT):
    """Setup/reset state, draw initial screen."""

def update(display, buttons, led, colors, WIDTH, HEIGHT):
    """Called every tick (~50ms). Handle input + draw."""
```

- `buttons` is a dict: `{"B": Button(13), "X": Button(14), "Y": Button(15)}`
- `colors` is a dict: `{"RED": pen, "GREEN": pen, "WHITE": pen, ...}`
- Apps are lazy-loaded and unloaded on switch to save memory

## Key Libraries

- `picographics`: Display driver (PicoGraphics, `DISPLAY_PICO_DISPLAY_2`)
- `pimoroni`: Button (with auto-repeat) and RGBLED control
- `network`, `ntptime`: WiFi and NTP time sync (sets UTC)
- `socket`, `ssl`/`tls`: Raw HTTPS connections (our phttp.py)
- `deflate`, `json`: Gzip + JSON for quote files

## Memory Constraints (Pico W — 264KB SRAM)

- Display framebuffer: ~77KB (320x240 at 8bpp)
- Available after boot + display: ~112KB
- Quote JSON files need ~165KB to decompress+parse — **too large** for current Pico W
- Pico 2W (520KB) would have ~440KB free — quotes would fit easily
- Always `gc.collect()` before heavy allocations
- `del` intermediates immediately, free unused modules via `del sys.modules[name]`

## pimoroni.Button API

```python
button.read()       # True on press + auto-repeats (200ms, 3x faster after 1s hold)
button.raw()        # Instantaneous state, no edge detection
button.is_pressed   # Same as raw(), property syntax
Button(pin, repeat_time=0)  # Single-shot, no auto-repeat
```

Buttons are active-low with internal pull-ups (`invert=True` default).

## Development Workflow

### mpremote CLI (Recommended)

```bash
uv tool install mpremote  # or: pip install mpremote
```

**IMPORTANT: Always use `connect /dev/cu.usbmodem1101`** (or whatever port). Auto-detection may pick wrong USB serial device (e.g. LG monitor).

```bash
# Common commands
mpremote connect /dev/cu.usbmodem1101 exec "..."        # Run code on Pico
mpremote connect /dev/cu.usbmodem1101 ls :              # List files on Pico
mpremote connect /dev/cu.usbmodem1101 repl               # Interactive REPL

# Upload files individually (NOT `cp -r src/ :` which nests the src dir)
mpremote connect /dev/cu.usbmodem1101 cp src/main.py :main.py

# Chain multiple uploads + reset
mpremote connect /dev/cu.usbmodem1101 cp src/main.py :main.py + cp src/app_pong.py :app_pong.py + reset
```

### Firmware

**Pico W (current: Pimoroni picow v1.25.0, MicroPython v1.25.0)**
- Download: [pimoroni-pico releases](https://github.com/pimoroni/pimoroni-pico/releases) — must be **picow** variant
- Flash: hold BOOTSEL + plug USB, drag .uf2 onto RPI-RP2 drive
- Wipe first if needed: flash `flash_nuke.uf2`, then re-flash firmware

**Pico 2W (future: RP2350)**
- Download: [pimoroni-pico-rp2350 releases](https://github.com/pimoroni/pimoroni-pico-rp2350/releases)
- Same flash procedure, uses **pico2w** variant

```python
# Check firmware version
import sys; sys.version

# Install packages on-device
import mip; mip.install("package-name")
```

## Agent Learnings

### MicroPython Gotchas
- **Imports**: `picographics`, `pimoroni`, `machine` are Pico-specific — LSP errors on desktop are expected
- **Module globals**: Functions modifying module-level vars need `global` declarations — missing these causes "local variable referenced before assignment"
- **Gzip**: Use `deflate.DeflateIO(f, deflate.GZIP)` — no `gzip` module
- **SSLSocket**: No `.flush()` attribute on MicroPython's SSL sockets — don't call it
- **`tls` vs `ssl`**: MicroPython uses `import tls`, CPython uses `import ssl`. The micropython-lib requests.py handles this

### Memory Management (264KB SRAM, ~112KB free after display)
- Display framebuffer (~77KB) is the biggest consumer. Always `gc.collect()` before allocations
- **Lazy load apps**: Use `__import__()` to load, `del sys.modules[name]` + `gc.collect()` to unload
- **Unload deps too**: When switching apps, also unload `llm`, `requests` etc. from `sys.modules`
- **Avoid full JSON parse**: API responses can be huge (web search results, reasoning tokens). Extract needed fields via string search instead of `json.loads()` — saves holding both raw bytes and parsed dict in memory
- **Delete intermediates**: `del response`, `del raw`, `gc.collect()` between steps

### Display & Buttons
- Must call `display.update()` after drawing — changes aren't automatic
- `pimoroni.Button.read()` has built-in edge detection + auto-repeat
- `pimoroni.Button.is_pressed` is raw state (no edge detection)
- **IRQ for buttons**: `machine.Pin.irq(trigger=IRQ_FALLING)` for instant response. Disable during app switching to prevent re-entry
- **PicoGraphics**: `rectangle()` takes 4 args (x, y, w, h) — no border radius. `circle()` and `triangle()` available
- All colors must be pre-created with `display.create_pen()` and stored in a dict

### Network & APIs
- **WiFi**: `network.WLAN(network.STA_IF)` — connect once at boot
- **Time**: `ntptime.settime()` sets UTC. Convert to local time with offset (see app_clock.py for Sydney DST)
- **HTTP**: Use micropython-lib `requests.py` (HTTP/1.0, no chunked). Copy it into src/
- **OpenRouter**: OpenAI-compatible API at `openrouter.ai/api/v1/chat/completions`. Supports plugins (web search via exa). Use `google/gemini-3-flash-preview` for fast, cheap responses
- **Reasoning models waste tokens**: Models like gpt-5-mini, kimi-k2.5 burn most of `max_tokens` on internal reasoning, leaving little for the answer. Avoid for short-response use cases
- **`max_tokens` vs `max_completion_tokens`**: Reasoning models (o1, o3, gpt-5) need `max_completion_tokens` instead of `max_tokens`

### mpremote
- `cp -r src/ :` copies the `src` dir itself, not contents. Upload files individually
- Blocking main.py infinite loops prevent REPL access. Use `flash_nuke.uf2` if locked out
- Always use `connect /dev/cu.usbmodem1101` — auto-detection picks wrong USB devices

### Testing
- `src/requests.py` shadows CPython's `requests` — use `sys.path.append()` (not insert) in tests
- Mock `env` module with `MagicMock()` before importing `llm` in tests
- Name custom HTTP module `phttp.py` not `http.py` (shadows CPython's built-in `http`)

## Files to Ignore

- src/env.py (contains secrets)
- __pycache__/
- .DS_Store

## Code Style

- Keep functions small and focused
- Clear variable names over comments
- Minimal comments (code should be self-documenting)
- No classes unless truly needed — module-level functions + globals for apps
- Always test on-device; desktop linting will flag false errors for Pico-specific imports

## Resources

### Official Documentation
- [MicroPython Docs](https://docs.micropython.org/) — language reference, stdlib
- [MicroPython stdlib](https://docs.micropython.org/en/latest/library/index.html) — built-in modules (socket, ssl, json, time, etc.)
- [mpremote](https://docs.micropython.org/en/latest/reference/mpremote.html) — remote control tool

### Pimoroni (Display + Firmware)
- [pimoroni-pico](https://github.com/pimoroni/pimoroni-pico) — Pico W firmware + libraries
- [pimoroni-pico-rp2350](https://github.com/pimoroni/pimoroni-pico-rp2350) — Pico 2W firmware
- [PicoGraphics API](https://github.com/pimoroni/pimoroni-pico/tree/main/micropython/modules/picographics)
- [pimoroni.py source](https://github.com/pimoroni/pimoroni-pico/blob/main/micropython/modules_py/pimoroni.py) — Button class source

### MicroPython Ecosystem
- [micropython-lib](https://github.com/micropython/micropython-lib) — official extra packages (requests, datetime, logging, etc.). Install via `mip.install()`
- [micropython-lib/requests](https://github.com/micropython/micropython-lib/tree/master/python-ecosys/requests) — official HTTP client (uses HTTP/1.0, no chunked)
- [Awesome MicroPython](https://github.com/mcauser/awesome-micropython) — curated list of libraries and projects
- [mrequests](https://github.com/SpotlightKid/mrequests) — HTTP client with chunked encoding support (reference)

### Hardware
- [Pico Display Pack 2.0](https://shop.pimoroni.com/products/pico-display-pack-2-0) — 320x240 LCD, 4 buttons, RGB LED
- [Raspberry Pi Pico 2W](https://littlebirdelectronics.com.au/products/raspberry-pi-pico-2wh) — RP2350, 520KB SRAM (upgrade path)
