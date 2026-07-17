# Inspiration

Visual + functional references for Chota. Links + notes mostly. Public/sharable images can sit alongside this doc in `docs/inspiration/`. Anything copyrighted, personal, or that we'd rather not redistribute goes in `docs/private/inspiration/` (gitignored).

## Receipt designs

### GUS — daily briefing receipt

Source: [@thisischristina on X](https://x.com/thisischristina/status/2051997062170890431)

**What to steal:**

- **Numbered sections** (`01 MESSAGE`, `02 TODAY`, `03 WEATHER`, `04 STOCKS`, `05 WORD`, `06 JOKE`) — feels structured + scannable. Translates well to thermal printer.
- **Section IDs** in monospace right-margin (`MES-8B4F6B`, `WEA-3F7B5B`) — fake "receipt" feel. Could generate random per-day for novelty.
- **Big section labels** like `[CLOUDY]` for the headline — much louder than our current `-- WEATHER --`. Consider for the print receipt.
- **Sparklines for time-series data** (stocks line graph). Same SVG-sparkline pattern works for our hourly temp / rain forecast on the dashboard `/weather` page (already in `docs/weather.md` as deferred). For the print receipt: dithered ASCII-art sparkline (`▁▂▃▅▆▇█`) renders cleanly on thermal.
- **Dithered icons** for weather / sections — the GUS cloud is a 1-bit dither pattern. We already plan ESC/POS dithering for the printer; a small library of icons (sunny / cloudy / rain) is a future polish.
- **Date prominent at top** — we already have this. Good confirmation.
- **Sunrise / sunset / rain block** in the weather section — small stats grid, clearly delineated.

**What NOT to steal:**

- Stocks. Not relevant for a family kiosk.
- The QR-style decorative dot grid in the header. Looks cool but adds nothing.

### Paper Console (Travis Miller) — thermal printer in a walnut box

Source: [github.com/travmiller/paper-console](https://github.com/travmiller/paper-console) · [design write-up](https://travismiller.design/paper-console/) · [Yanko Design coverage](https://www.yankodesign.com/2026/04/09/this-walnut-box-prints-the-news-youd-scroll-for-only-10-were-made/)

The closest existing cousin of the chota box (`docs/next.md`): a thermal printer inside a walnut enclosure, one dial + one button, prints news/content on demand. Only 10 made — proof the "warm wooden appliance around a receipt printer" form factor lands with people.

**What to steal:**

- The single-gesture interaction (turn → press → paper) — validates our WHO/WHAT dial + PRINT button loop.
- Front paper exit with the printer vertical — viable fallback if our top-slot layout fights us (our MUNBYN advertises wall-mount support, so vertical is officially fine).
- The restraint: no screen on theirs at all. A reminder that the printer alone carries the product; our Inky lid is additive, not load-bearing.

**Where ours differs on purpose:** top toast-pop slot instead of front exit; two dials (person × format); the tilting e-ink lid; per-family config + self-hosted server instead of fixed content.

## Field notes — June 2026 research sweep

Four parallel research passes (thermal-printer projects, control panels, e-ink dashboards, Pi kiosk stack) before the box build. Decision-changing items went into [`next.md`](next.md); this is the rest worth keeping.

### Thermal printers in the field

- **Pre-generate at night, print on button press** — the single strongest product finding across projects ([roborhythms](https://www.roborhythms.com/build-ai-daily-brief-receipt-printer-agent/), BERG Little Printer post-mortem via [Nord Projects](https://nordprojects.co/projects/littleprinters/)): content pulled by a physical action feels like a gift; content that auto-appears feels like a memo/spam.
- **Content that survives novelty:** one-line weather, 2–3 calendar items, one joke/puzzle. What dies by week 3: news headlines, quotes-of-the-day, vocabulary words. Hard cap ~35–40 lines; >45 seconds to read = too long ([Hérault HN thread](https://news.ycombinator.com/item?id=44256499)).
- **USB-over-weeks reliability recipe:** blacklist `usblp` (already in our bootstrap), open the device fresh per print job, `printer.init()` (ESC @) at the start of every job, one detach-and-retry on LIBUSB_ERROR before alerting ([node-usb #306](https://github.com/node-usb/node-usb/issues/306)). Worth auditing `print/printer.ts` against this.
- **Maintenance rhythm:** monthly isopropyl wipe of head + platen, air-blast the cutter channel (debris is the #1 cutter failure), post-cut feed of a few blank lines prevents tab re-feed jams.
- **Dithering canon for photos:** flatten → greyscale → resize → **gamma 1.8** → Floyd-Steinberg → 50% threshold; the gamma step is the most-skipped, most-impactful ([screaming.computer](https://screaming.computer/blog/2023-05/imagick-image-dithering-for-thermal-receipt-printers)). Never light-weight/gray fonts in print CSS.

### E-ink in the field

- Spectra 6 7.3" real-world refresh is 20–25s wall-clock; partial refresh on colour panels causes cumulative colour drift — full refresh only ([Seeed forum](https://forum.seeedstudio.com/t/ee04-and-spectra-6-7-3-partial-refresh/295260)).
- Burn-in is a myth for changing content; lifetime ~1M+ updates. Ghosting clears with an all-white frame; the AC-waveform Spectra 6 (April 2026+) further reduces it.
- Gamut is closer to CMYK than sRGB — bold primaries render clean, pastels/cyan/purple dither muddy. Calibrate against the physical panel, not spec hex values ([einkframe.com](https://www.einkframe.com/2025/11/26/spectra-6-color-gamut-part1/)).
- Update cadence consensus from MagInkCal/InkyPi/TRMNL: a few refreshes a day is the sweet spot; hourly is the ceiling of usefulness for calendar content.
- Reference projects: [InkyPi](https://github.com/fatihak/InkyPi) (closest cousin: Pi + Inky Impression + web UI + headless-browser rendering), [MagInkCal](https://github.com/speedyg0nz/MagInkCal), [TRMNL](https://trmnl.com/) (commercial validation; their lesson — value is reduced phone-checking friction, not information density).

### Control panels in the field

- Pico ADC is structurally noisy (reference rides the 3.3V rail + a known SAR nonlinearity spike) — AGND + oversampling + hysteresis is the standard fix; MCP3208 SPI ADC is the escape hatch ([Hackaday characterization](https://hackaday.com/2021/03/15/raspberry-pi-pico-adc-characterized/)).
- EC11 buying note: good variants are 1 detent = 1 pulse; cheap ones are 30 detents/15 pulses ("every other click does nothing"). CTS/Alps (~$4) often need no RC filter. Reference debounce impl: [miketeachman/micropython-rotary](https://github.com/miketeachman/micropython-rotary); the Pico PIO quadrature example is the zero-CPU gold standard.
- CircuitPython's dual `usb_cdc` ports (console + data) beat MicroPython's shared-REPL serial for a Pico peripheral ([smittytone](https://blog.smittytone.net/2022/02/16/pico-usb-serial-communications-with-circuitpython/)). No OTA — UF2 drag-drop is the realistic update path.
- Panel meters: ≥1kHz PWM + 2–10µF smoothing cap + trimmer for full-scale calibration (meters vary ±20%); relabel faces with Galva-printed paper ([panel meter clock](https://arduinoplusplus.wordpress.com/2022/09/06/analog-panel-meter-clock/)).
- Ground all metal panel hardware to system GND via 1MΩ (static bleed); Pi in a sealed wooden box runs +15–25°C over ambient — vent low-in/high-out for convection.

### Pi kiosk stack in the field

- 2026 verdict: console-autologin → **labwc** → Chromium user service (`Restart=always`); cage is architecturally right but fights XDG_RUNTIME_DIR/logind on OS Lite ([RPi forums](https://forums.raspberrypi.com/viewtopic.php?t=390764), [benswift.me 2025 guide](https://benswift.me/blog/2025/07/16/automated-rpi-web-kiosk-setup-in-2025/)).
- `--ozone-platform=wayland` is mandatory on Pi 5 (else XWayland fallback); `--disk-cache-dir=/dev/null` saves the SD card; patch `exited_cleanly` in Preferences pre-launch to kill the crash-restore bubble.
- Memory: server ~150MB + kiosk Chromium ~250–400MB + screenshot Chromium ~300–600MB ≈ 1–1.5GB of 4GB — fine, but stagger screenshot jobs, nightly-restart the kiosk (leak), and don't trust `MemoryMax=` (Pi 5 Bookworm memory cgroup is broken — [raspberrypi/linux #5933](https://github.com/raspberrypi/linux/issues/5933)).
- SSE wins over WebSocket for the panel (one-way, auto-reconnect, sub-ms on localhost); rotation via `wlr-randr --transform` must be re-passed on every `--on`.

## Daily content sections — brainstorm

User idea: receipt has rotating "interesting" sections beyond data. **Pattern: 5 possible sections, randomly pick 2 each day** so the receipt stays varied + bounded length. Deterministic per-Sydney-date so a reprint shows the same picks.

```
SECTIONS = ['joke', 'fact', 'math', 'word', 'photo', 'news']
todayKey = sydneyYMD(now)
todaySections = pickN(SECTIONS, 2, seed=hash(todayKey))
```

Some sections (like `news`) might also appear on the dashboard _and_ the receipt — they're not mutually exclusive surfaces. The rotating-pick logic just decides what makes it to the _receipt_ on a given day.

### Joke of the day (kid-friendly)

| Source                                                    | Pros                           | Cons                                 | Verdict                            |
| --------------------------------------------------------- | ------------------------------ | ------------------------------------ | ---------------------------------- |
| **Local JSON** (~100 hand-curated)                        | Predictable, controllable      | Effort to curate                     | Best for kid-appropriate baseline  |
| [icanhazdadjoke.com](https://icanhazdadjoke.com) free API | Free, ~600 jokes, mostly safe  | Rare adult slip-throughs             | Good fallback / mix                |
| [jokeapi.dev](https://jokeapi.dev)                        | Has `safe-mode` filter         | Variable quality                     | Backup                             |
| LLM (Haiku via Gateway)                                   | Infinite, kid-tuned via prompt | Variable quality, occasional misfire | Fallback when local pool exhausted |

**Recommendation:** Local JSON of 100 jokes (curate over time) + LLM fallback when running low.

### Science fact of the day

| Source                                                                                    | Pros                                       | Cons                              | Verdict                                                    |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------- | ---------------------------------------------------------- |
| [NASA APOD](https://apod.nasa.gov/apod/)                                                  | Daily, free, kid-fascinating, image-driven | Astronomy only                    | Best single source                                         |
| [Wikipedia "On this day"](https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries) | Free, real history, varied                 | Sometimes mature events           | Filter at LLM step                                         |
| Local JSON of facts                                                                       | Curated, on-brand                          | Effort                            | Long-term play                                             |
| LLM-generated                                                                             | Infinite, kid-tuned                        | Quality risk, "LLM busywork" feel | Use sparingly, maybe one Haiku per day with a tight prompt |

**Recommendation:** Mix — NASA APOD on weekdays (image + caption); Wikipedia "on this day" filtered through Haiku for kid-appropriate framing on weekends.

### Math puzzle / fact

| Source                                    | Pros                          | Cons                                                    | Verdict  |
| ----------------------------------------- | ----------------------------- | ------------------------------------------------------- | -------- |
| **Local JSON** (~50 puzzles by age)       | Reliable, age-tuned per kid   | Curation effort                                         | Best     |
| LLM-generated with verification           | Infinite, can target each kid | Risk of broken puzzles, needs second LLM call to verify | Fallback |
| [Project Euler](https://projecteuler.net) | Established                   | Way too hard for kids                                   | Skip     |

**Recommendation:** Curate 50 age-appropriate puzzles in JSON. Print 1 per kid, rotate. Solutions on a separate "answer" reprint? Or just include upside-down at the bottom.

### Word of the day (vocabulary)

| Source                                       | Pros                         | Cons                             | Verdict   |
| -------------------------------------------- | ---------------------------- | -------------------------------- | --------- |
| [Wordnik API](https://developer.wordnik.com) | Free tier, has WOTD endpoint | Sometimes too obscure            | Try first |
| [Wiktionary](https://en.wiktionary.org)      | Free, comprehensive          | No daily endpoint, need scraping | Skip      |
| Local JSON                                   | Curated by reading level     | Effort                           | Long-term |

**Recommendation:** Wordnik first; fallback to local JSON. Filter for kid-appropriate length + meaning.

### News (kid-friendly, RSS-driven)

User idea: small news section on dashboard + print receipt. Pull from a mix of RSS feeds, run through Haiku to rewrite as 2-3 kid-friendly short lines. **Not a marquee ticker** — those distract; static section that updates on dashboard load is calmer.

| Source                                                          | Notes                                                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [BBC Newsround](https://www.bbc.co.uk/newsround)                | RSS available; already kid-focused, light pre-processing needed. **Best primary source.** |
| [National Geographic Kids](https://kids.nationalgeographic.com) | Animal + science focus; check if RSS exists or scrape                                     |
| [Science News for Students](https://www.snexplores.org)         | Has feed; teen-focused but interesting                                                    |
| BBC News (general) science feed                                 | Adult source; needs heavier kid-rewrite                                                   |
| The Guardian science RSS                                        | Same                                                                                      |
| NASA News                                                       | Space-flavoured, easy to make exciting                                                    |

**LLM rewrite pattern:** Haiku via Gateway — pass top 5-10 article titles + summaries from a mix of feeds, prompt: _"Pick 2-3 most family-interesting. Rewrite each as one sentence in simple words a 10-year-old understands. No politics, no violence, no scary stuff. Bias toward science / discovery / animals."_

**Print form:**

```
-- NEWS --
  - NASA's new Mars rover found weird purple rocks.
  - A new octopus was discovered near Antarctica.
```

**Dashboard form:** small `News` card, 2-3 bullet lines, refresh on each load. Same data feeds the print receipt.

**Implementation when built:**

- `npm i rss-parser` (already noted in plan.md as deferred)
- Feed list lives in `chota.config.ts` (so forks can use local feeds)
- `getNews(opts?)` tool: fetches all feeds in parallel, dedupes, returns top N raw items
- `summarizeNews(items)` helper: calls Haiku with the prompt, returns `{ kidLine: string }[]`
- Cache the LLM output for ~6h so dashboard refreshes don't burn tokens

### Photo of the day (Google Photos memories)

User idea: random pic from older Google Photos library, LLM caption ("On this day 2 years ago — Blue Mountains hike"). v1 had a Python `gen_image.py` with a safety-gate + warm-style suffix pattern worth preserving (see `docs/audit-2026-05.md` §"Ideas Worth Salvaging").

| Source            | Notes                                                                                                    |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Google Photos API | Requires OAuth (same project as Calendar). `mediaItems.search` with date range to find "on this day".    |
| LLM caption       | Gemini Flash (cheap, multimodal via AI Gateway) — pass image bytes, ask for one warm-tone sentence.      |
| Print path        | Need 1-bit dither at appropriate size for the printer (`sharp` for resize + dither). Caption text below. |

**Defer until:** the agent loop ships (Google OAuth is already wired via better-auth). High-effort feature; high-emotion payoff.

## Calendar — connecting Google Calendar

Plan §"Auth & Google integrations" already covers the OAuth flow. Specific to this brainstorm:

- **Today section** of the print receipt should show calendar events for _today_ (event titles only, ASCII):
  ```
  -- TODAY --
    08:00  Kid1 school
    16:00  Kid2 swim
    18:30  Family dinner
  ```
- **Imminent flag**: an event within ~60 min could get a `*` prefix.
- **Tomorrow lookahead** (in the agent's closing OR a separate section): "Tomorrow: Kid2 excursion — pack lunch + closed shoes" — joins to `activities` config in `chota.config.ts` for gear hints.

### Implementation notes

Built — see `src/lib/server/tools/calendar.ts`. Uses `googleapis` + better-auth's Google OAuth (no manual `scripts/google-auth.mjs` token dance). Calendar ID lives in `chota.config.ts > calendar.id`. Filters to that one calendar; multiple-calendar support is a future option.

## Other patterns worth noting

- **Big bold section header** (GUS uses `[ CLOUDY ]` style). Could lift our headline to:
  ```
  -- WEATHER --
    [ CLOUDY ]
    16C, feels 16C. Rain by 4pm (84%).
  ```
- **Right-margin annotations** (GUS section IDs). Cute but optional. Could randomly stamp section IDs for visual rhythm.
- **Sparkline in print** — temp/rain hourly trend rendered as `▁▂▃▅▆▇█` Unicode blocks. Note: not ASCII, so the plain-text path can't use them; only the HTML→image path. Thermal printer renders the rastered version cleanly.

## Where to add this stuff

When ideas here become real:

- New tools → `tools.md` (Future ideas section)
- Print format additions → `plan.md` §Print formats
- Visual design → `weather.md` (or new per-feature design doc)
- Schema changes → `chota.config.ts` types in `src/lib/config.ts`

This file stays as the unfiltered idea pile.
