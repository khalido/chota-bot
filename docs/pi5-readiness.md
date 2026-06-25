# Pi 5 (4GB) readiness

Hardware-readiness analysis for migrating chota from the X230 to a **Raspberry Pi 5 4GB** (official 27W PSU + Active Cooler, both already bought). Pressure-tests [`next.md`](next.md)'s migration + dual-screen plan, with the 4GB-RAM angle the focus. Screen picks were independently double-checked against current (June 2026) product pages, Pi forums, and the kernel tracker.

---

## Verdict

**Server-only (today's headless box): comfortable.** chota's runtime is a single Node process + a remote-inference AI stack. The only heavy local component is the agent-browser Chromium used for the 06:45 screenshot, and it runs in a window where nothing else competes. Realistic idle is **~250–400 MB used**; the daily print burst peaks the box at **~700–900 MB**. On 4 GB that's **>3 GB free** — never close to pressure.

**With both kiosk screens later (3 Chromium contexts): tight-but-fine, with mitigations.** Two persistent kiosk Chromiums (lid `/clock` + deck `/panel`) plus the screenshot Chromium is the worst case. Steady state lands around **1.4–2.0 GB used**, peaking ~2.2–2.5 GB during a print burst if both kiosks are awake. That leaves **1.5–2.5 GB headroom on 4 GB** — enough, but only because (a) inference is remote so there's no model in RAM, and (b) Chromium leaks must be capped with **nightly restart timers** and the screenshot must be **staggered off the kiosk peak**. Without those two mitigations a multi-day-uptime box will slowly drift into swap.

**Do not buy 8 GB on RAM grounds.** Nothing here needs it. 8 GB would only be justified if a _local_ LLM or heavy image pipeline ever moved on-box — not on the roadmap (the AI SDK calls out to Vercel AI Gateway / Gemini; see `src/lib/server/agent/index.ts`). The 4 GB the user already bought is the right call. The genuine Pi-5 risks are **power-rail / DSI hardware quirks**, not memory.

---

## Memory / CPU budget

Inference is **remote** (`MODEL = 'google/gemini-3.5-flash'` via AI Gateway), so no model weights live on the box. SQLite is `better-sqlite3` (in-process, tiny). The only multi-hundred-MB resident is Chromium.

| Component                                                  | Idle RAM                                                    | Peak RAM                                 | CPU notes                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------- |
| Node server (adapter-node, SvelteKit)                      | ~120–180 MB                                                 | ~250 MB under request load               | low; bursty on render                                                      |
| better-sqlite3 (`data/home.db`)                            | in-process, ~5–20 MB                                        | same                                     | negligible; synchronous, no extra process                                  |
| croner jobs (refresh + print)                              | within Node                                                 | within Node                              | short ticks; weather/bus/sentral are I/O-bound fetches                     |
| Telegram long-poll (grammy `getUpdates`)                   | within Node, ~few MB                                        | same                                     | one idle outbound HTTP loop; trivial                                       |
| LogTape (file sink)                                        | within Node, ~few MB                                        | same                                     | negligible                                                                 |
| **agent-browser Chromium (screenshot)**                    | **~150–250 MB resident** (persistent session, never closed) | **~300–450 MB** during a render          | **CPU spike**: page render + full-page screenshot. ~1–4s/brief, serialized |
| Kiosk Chromium — lid `/clock` (later)                      | ~200–350 MB                                                 | ~400 MB; **grows ~50–150 MB/day** (leak) | low steady; per-minute clock repaint is cheap                              |
| Kiosk Chromium — deck `/panel` (later)                     | ~180–300 MB                                                 | ~350 MB; same leak profile               | low; mostly dark/off, SSE-driven wake                                      |
| labwc/wlroots (or X11) compositor (later)                  | ~60–120 MB                                                  | ~150 MB                                  | low                                                                        |
| OS Lite baseline (kernel, systemd, Tailscale, Caddy, sshd) | ~150–250 MB                                                 | —                                        | low                                                                        |

**Worst case — print burst while both kiosks awake (the 3-Chromium moment):**

```
OS + services        ~200 MB
Node + sqlite        ~200 MB
compositor           ~100 MB
lid Chromium (aged)  ~450 MB   ← pre-nightly-restart
deck Chromium        ~300 MB
screenshot Chromium  ~400 MB   ← the burst
──────────────────────────────
                   ~1.65 GB used, ~2.35 GB free on 4 GB
```

Even aged and unlucky this stays under ~2.5 GB. **The screenshot burst is the single biggest transient**, and it is the easiest to move out of the way (it runs at 06:45, when both kiosks should be at their _lowest_ — lid dimmed/off overnight, deck dark). If anything the natural schedule already de-conflicts; just don't accidentally wake the kiosks for the print.

**CPU:** Pi 5 (4× A76 @ 2.4GHz) handles a single full-page Chromium render comfortably — the burst is a few seconds of one-to-two busy cores, which is exactly why next.md insists on the **Active Cooler** (already bought). The morning job renders **serially**, one recipient at a time (`for (const who of recipients)` in `jobs/morning-print.ts` → `composeImage` → `briefToPng`, and snapshot.ts serializes via a promise chain). So even a 4-recipient weekday is ~4 sequential ~2–4s bursts, not a parallel spike. Good for 4 GB; no concurrency blow-up.

---

## Risks & mitigations (ordered)

1. **Chromium RAM leak on long-uptime kiosks (later phase).** The two persistent kiosk Chromiums grow over days (next.md already flags this). **Mitigation:** the `Restart=always` user service + a **nightly systemd restart timer** per kiosk (next.md's plan — keep it). Restart in the small hours when the lid is already off. This is mandatory for the screens phase, not optional.
2. **Screenshot burst colliding with kiosk peak.** **Mitigation:** keep the 06:45 print scheduled when kiosks are dark/dimmed (already the case via the backlight schedule). Do **not** wake `/panel` or `/clock` to "show printing" at 06:45. If on-demand prints ever fire while both kiosks are bright, the box still fits — but treat 06:45 as the protected window.
3. **agent-browser session never closed → permanent ~200 MB resident.** `snapshot.ts` drives one shared persistent browser and never calls `agent-browser close`. Harmless on the server-only box (plenty of free RAM, and a warm browser makes prints faster). **Optional mitigation if RAM ever tightens in the 3-Chromium era:** add a `close --all` after the morning batch (cold-start cost is ~1–2s on the next print) — or restart `chota.service` nightly, which drops the resident browser for free. Recommend the nightly service restart over per-call close: keeps prints warm during the day.
4. **Swap on the SD card = wear + slowness.** A Pi swapping to microSD is both slow and burns write cycles. **Mitigation:** enable **zram** (compressed RAM swap — Pi OS has `zram-tools`; ~1–2 GB compressed zram costs no SD writes and absorbs the leak drift between nightly restarts). Set `vm.swappiness=10` so it only engages under real pressure. Avoid a large _disk_ swapfile on the SD. With zram + nightly restarts, the box should never touch SD swap.
5. **Boot/missed-print if the box is down at 06:45.** Unchanged from today — `morning-print.ts` has no catch-up tick (it says so). Not a RAM issue, but the Pi's ~3W lets it stay on 24/7 cheaply, so just leave it running.
6. **Chromium flags to set on the kiosks** (RAM/stability hygiene): keep next.md's `--kiosk --ozone-platform=wayland --noerrdialogs --no-first-run --disable-session-crashed-bubble --disk-cache-dir=/dev/null`. Add `--disable-gpu-shader-disk-cache` and consider `--memory-pressure-off` is **not** recommended (it tells Chromium to stop reclaiming under pressure — the opposite of what a 4 GB box wants; leave default memory pressure ON). For the deck `/panel`, since it's dark most of the time, that Chromium's working set stays small.
7. **A2 SD card I/O as the real bottleneck (not RAM).** Build (`npm run build`) and `npm ci` native rebuilds are I/O-heavy. **Mitigation:** the A2-rated 32–64 GB card next.md already lists; consider booting from USB SSD later if build times annoy. Doesn't affect the running app's RAM.

---

## arm64 migration gotchas (checklist)

- [ ] **better-sqlite3** — native; `npm ci` rebuilds for arm64. Prebuilt arm64 binaries exist for current versions; if a source build triggers, the box needs `python3` + `make` + `g++` (Pi OS Lite may lack them — `sudo apt install -y build-essential python3`). Verify the DB opens after first `npm run build`.
- [ ] **usb (node-usb)** — native; ships libusb **statically linked** (per deploy.md), so no apt libusb. Rebuilds for arm64 via `npm ci`. The udev rule (`deploy/99-munbyn-printer.rules`) + `plugdev` membership are the real gate, not the arch.
- [ ] **@napi-rs/canvas** — native (the canvas fallback renderer). Ships **prebuilt arm64 (`linux-arm64-gnu`) binaries** — should resolve without a source build. Confirm it loads; this is the fallback path when agent-browser is unavailable, so it must work on the new box.
- [ ] **agent-browser → linux-arm64 Chromium** — `agent-browser install` pulls a linux-arm64 Chromium build. next.md already says: **run the screenshot path once by hand before trusting the 06:45.** Do exactly that (`curl -X POST localhost:8000/api/print/<who>` or the snapshot directly). This is the highest-risk arm64 piece because it's a large external download with its own platform matrix.
- [ ] **node-thermal-printer** — pure JS, no native build; arch-agnostic.
- [ ] **grammy / googleapis / ai / @ai-sdk/\* / logtape / cheerio / zod** — pure JS; no arm64 concern.
- [ ] **Node via fnm** — `chota.service` hard-codes the fnm default-alias node path; install fnm + Node LTS on the Pi first (next.md first-boot step 4). Globals (`agent-browser`) are per-Node-version under fnm — reinstall after any Node upgrade (deploy.md §Updating Node).
- [ ] **Headless: no display server needed for the screenshot.** agent-browser runs headless Chromium; the server-only Pi needs **no** labwc/X11 for the 06:45 print. The compositor is only for the _kiosk_ screens phase. Don't install a desktop on the server-only box.
- [ ] **Image: Raspberry Pi OS _Lite_ (64-bit), NOT the Desktop image.** In Imager the headline pick is now "Raspberry Pi OS — Debian Trixie **with the Raspberry Pi Desktop**" (full PIXEL desktop, LibreOffice, etc.) — _not_ what we want. Choose **Raspberry Pi OS (other) → Raspberry Pi OS Lite (64-bit)**: headless server, ~3 GB, nothing we don't use. The lid/deck kiosk lands later as a thin apt layer (**labwc** + Chromium) on top of Lite — and starting from Lite lets us install **labwc specifically** rather than inherit the Trixie desktop's default compositor (which can be Wayfire — the one we must avoid for dual-output). Current base = **Debian Trixie**, kernel **6.18.34 LTS** (2026-06): fine for our stack; just do the arm64 rebuilds above + the agent-browser screenshot validation.
- [ ] **drizzle-kit push** on first deploy (deploy.sh step 3) — pure JS, fine.

---

## Storage — SD card (size + speed) and the NVMe endgame

**Recommendation: a 64 GB, A2 / U3 / V30 card — SanDisk Extreme or Samsung PRO Plus.**

- **Size — 64 GB.** 32 GB technically fits (OS Lite ~3 GB + node*modules + the bundled agent-browser Chromium ~400 MB + a second kiosk-Chromium cache + SQLite + rotating logs + the sibling `curios` content), but it leaves little room as logs/data grow \_and* less spare area for wear-levelling. 64 GB is the sweet spot; 128 GB only if the price delta is trivial (a bigger card also wear-levels across more cells → longer life). Don't go bigger for capacity's sake — we need headroom, not space.
- **Speed — A2 is the spec that matters, not the GB/s number.** A Pi boot disk's bottleneck is **random IOPS** (lots of small SQLite + log reads/writes), not sequential throughput. **A2** (App Performance Class 2) mandates high random IOPS and is the right class; U3/V30 (sequential) comes along for the ride and isn't the constraint. Buy a quality brand — **SanDisk Extreme** or **Samsung PRO Plus** (both A2/U3/V30) are the reliable Pi performers. Avoid no-name cards (the #1 cause of Pi corruption/instability).
- **Endurance — the real long-term failure mode.** An always-on box writing SQLite + logs for years wears flash. We already blunt this: **zram** (no swap-to-SD — see Risks) and LogTape's **rotating** file sink (bounded log writes). If you want to optimise purely for write-lifespan, **Samsung PRO Endurance** is built for 24/7 writes — but it's tuned for sequential endurance and its random IOPS can trail the Extreme/PRO Plus, so for our DB-random-write profile a quality A2 all-rounder is the better pick.
- **The durability endgame: boot from NVMe (or a USB-3 SSD).** The Pi 5 has a PCIe lane — an **NVMe SSD via a HAT** (or a USB-3.0 SSD) as the boot disk eliminates SD wear entirely and is much faster, the right answer for a box meant to run for years. Not needed for first boot or the parallel-run; treat it as the upgrade once the box is permanent (SD becomes recovery/boot-only). Worth leaving room for it in the box layout.

**Net:** buy one **64 GB A2 (Extreme / PRO Plus)** now; enable zram on first boot (already in the plan); plan an NVMe/USB-SSD boot if/when the box becomes the permanent home.

---

## Screen recommendations — verified

Two Sonnet subagents independently checked next.md's picks against live product pages, Pi forums, and the kernel tracker (June 2026). **Both picks hold.** Two material corrections and one upgraded risk below.

### Deck — Waveshare 5" DSI LCD (B) low-power — CONFIRMED

- **Price/availability:** AU **$69.95 inc GST**, in stock at Core Electronics (WS-21973). 800×480 IPS, tempered glass (6H), bare PCB. Confirmed.
- **Rev2.2 requirement: REAL and current.** Rev2.1-and-older boards make the Pi 5 misread the panel's capacitors as a short-circuit and refuse to power up; Rev2.2 fixes it (older boards can be salvaged by removing four marked caps, but don't — buy current stock, which ships Rev2.2). Per Waveshare's own wiki.
- **22→15-pin adapter: REAL, not included.** Pi 5 DSI is 22-pin; this board is 15-pin. Buy the Waveshare "Pi5 display cable" separately (~**US$6–8**, i.e. a bit more than next.md's "~$5"; 200/300/500mm options).
- **Backlight off via sysfs: confirmed, with a caveat.** `wlr-randr --off`/DPMS blanks the image but the DSI backlight glows — the reliable kill is `echo 0 > /sys/class/backlight/*/brightness`. **CORRECTION/FLAG:** the `bl_power` file next.md cites **could not be independently confirmed** for this board — plan on `brightness 0` as the off switch and verify `bl_power` on the actual hardware before depending on it. (next.md already notes the 100K→68K BL-resistor mod if minimum brightness still glows — that remains the documented fix.)
- **Alternatives sanity-checked:** Waveshare 5" (C) 1024×600 — **US$54.95** (PiShop.us), no AU stockist (confirmed). Freenove FNK0078 — **US$39.99**, no Pi5 adapter in box + backlight undocumented (confirmed). DFRobot DFR0550-V2 — **US$49.90**, _does_ include the Pi5 cable, optically bonded matte; no AU stockist (price confirmed, AU-absence likely). **Verdict: the (B) stays the pick** — AU stock + documented backlight beat the alternatives on convenience.

### Lid — Waveshare 10.1" DSI LCD (C) — CONFIRMED, with two corrections

- **Price/availability:** AU **$129.95**, in stock at Core Electronics (WS-23450). 1280×800 IPS, bare-PCB look. Confirmed. Plus the same 22→15-pin Pi5 cable (~US$8–12).
- **Backlight overlay/sysfs: directionally right, exact node may differ.** Driver is merged into the Pi kernel (no separate install on Bookworm). **CORRECTION:** the backlight node may be the Waveshare-specific `/sys/waveshare/rpi_backlight/brightness` rather than `/sys/class/backlight/*/brightness` — the `*` wildcard _may_ resolve it, but **discover the actual path on the hardware** before wiring the backlight-schedule job. Keep Pi OS current — a 6.1.74/6.1.77 kernel I2C regression on DSI displays was fixed later (PR #6050).
- **Power feed: CONFIRMED — needs aux 5V.** The 10.1" (C) takes **5V + I2C via a 4-pin GPIO header connection**, not the FFC alone (~520mA at full backlight, ~150mA backlight-off). next.md's "check the power feed" hunch is correct and the answer is yes — budget the 4-pin header wiring. (The header is free in the LCD-lid design, so fine.)
- **Dual-DSI on Pi 5: possible, but UPGRADED RISK — 3.3V rail collapse.** The Pi 5 has two DSI/CSI combo ports, so 5" + 10.1" on separate ports is the plan. **But a real forum report shows the 3.3V rail can collapse to 0V with two DSI panels connected, depending on each panel's hardware revision** (the same over-current-detection family as the Rev2.2 issue). This is **more than next.md's "forfeits a camera port, fine"** — it's a _test-before-committing_ item. Mitigation: buy current-revision boards (reduced 3.3V draw), and bring up each panel **individually first**, then together, watching for boot/rail failure. Have the X11 fallback ready regardless.
- **Kernel bug #7041: confirmed, but DOES NOT apply to dual-DSI.** #7041 ("labwc doesn't report wl_output for HDMI when a DSI/Touch2 panel is connected") is **DSI+HDMI only**. The proposed box is **dual-DSI, no HDMI**, so #7041 is **irrelevant** to the actual config. next.md is over-cautious here — keep the awareness, but it's not a blocker for the chosen topology. (Issue is marked closed on the tracker.)
- **labwc per-output kiosk placement: confirmed flaky — keep the X11 fallback.** Multiple 2025–26 forum threads + labwc's own stance (it doesn't target kiosk) confirm per-output Chromium placement under labwc is unreliable. **The documented reliable path is X11 + xrandr + two Chromium windows with `--window-position` + per-instance `--user-data-dir`.** next.md's fallback is the right one; budget for it being the _primary_ path, not the fallback.
- **10.1" as the ceiling: CONFIRMED.** Waveshare's only larger Pi DSI panel is an 11.9" but it's a **320×1480 portrait bar** (ticker), useless as a landscape literary clock. 10.1"/1280×800 is the practical landscape ceiling. next.md's size-ceiling call stands.

### Deck-screen topology — DSI vs HDMI vs Pico (revised 2026-06-25)

The lid is **DSI, non-negotiable** — it's the panel that needs scheduled dimming (evening-dim, night-off) via `/sys/class/backlight`, which only DSI gives cleanly on a Pi 5. The open question is the **deck** screen, and a key insight reframes it: **the deck is on/off only (no dimming), and it sits _under the lid_ — so when the box is closed the lid physically hides any glow.** The no-glow-at-night contract is met by closing the lid, not by backlight control. That removes the one reason the deck needed DSI. Three topologies, each trading a different Pi-5 gotcha:

1. **DSI lid + HDMI deck (leading option).** The deck runs a small HDMI LCD as a Chromium `/panel` kiosk — keeps the web-UI authoring + three.js/Svelte dial animations the deck is for. HDMI is plug-and-play with a huge panel selection, and **avoids the dual-DSI 3.3V-rail risk entirely** (only one DSI). Coexistence is fine: DSI + HDMI are independent DRM cards and **labwc or X11 drive both** (only **Wayfire** can't — it renders to one display; don't use it). **Two caveats to verify on arrival:**
   - **Kernel/HDMI — now likely moot.** There was a Feb-2026 HDMI regression on the **6.12** line; Pi OS has since moved to **kernel 6.18.34 LTS** (release 2026-06-18, Trixie), so a fresh install is past that specific bug. Don't plan to "pin 6.6.x" — that's a downgrade off Trixie and unnecessary. Just **smoke-test HDMI on whatever kernel the box ships** at the deck phase (kernels are a moving target; a newer one could introduce its own DSI/HDMI quirk). ([forum](https://forums.raspberrypi.com/viewtopic.php?p=2364475))
   - **Idle backlight.** A bare HDMI panel may keep its backlight lit on a blank/DPMS-off frame (depends on the driver board). Mostly moot — the lid hides the deck at night — but a daytime-idle deck could show a lit-black screen. Pick a panel whose board enters standby on signal loss if that bugs you.
2. **Dual DSI (original next.md plan).** Both panels DSI. Trades the HDMI-kernel risk for the **3.3V-rail-collapse risk** (gotcha #3) — revision-dependent, test both boards together.
3. **DSI lid + Pico-driven deck.** Avoids _both_ hardware risks, but the deck becomes a Pico-native readout (MicroPython/displayio) — **you lose the Chromium `/panel` route and the three.js animations.** Only worth it if both DSI _and_ HDMI prove troublesome.

**Recommendation:** the deck is **HDMI** (option 1) unless on-arrival testing says otherwise — it dodges the dual-DSI rail risk and keeps the web/three.js deck animations. Since we **ship the lid first** (single DSI, _zero_ topology risk — see below), this decision is deferred anyway: bring up the lid clock, then test HDMI-deck coexistence on the box's actual kernel before buying the deck panel. (Rule-outs unchanged for completeness: e-ink can't do the per-minute clock, SPI too slow, Touch Display 2 bezel, USB-C monitor = the ignored-dashboard trap.)

> **three.js on the deck — keep it light.** A WebGL/three.js scene is heavier (GPU + RAM) than CSS/Svelte transitions, and it'd be the 3rd Chromium context on a 4 GB box (see the memory budget). For dial-turn effects, prefer Svelte/CSS or a lightweight 2D canvas; if you want true 3D, keep the scene minimal and lean on the nightly Chromium restart. Test the deck's RAM under the 3-Chromium worst case.

### Verified screen BOM (current AU pricing)

| Item                                      | Source                      | Price            | Note                                                                                                                                                                             |
| ----------------------------------------- | --------------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Waveshare 10.1" DSI LCD (C) 1280×800      | Core Electronics (WS-23450) | **AU $129.95**   | **lid `/clock`** — buy first; in stock                                                                                                                                           |
| 22→15-pin Pi5 DSI FPC cable               | Waveshare / Amazon          | **~AU $12–18**   | for the lid DSI; **not included** (×2 only if you go dual-DSI for the deck)                                                                                                      |
| 4-pin header jumper for 10.1" 5V/I2C feed | —                           | trivial          | confirmed required for the 10.1"                                                                                                                                                 |
| **Deck panel — DECIDE AFTER TESTING**     | —                           | ~AU $40–70       | **HDMI** small LCD (leading — dodges dual-DSI rail risk) _or_ Waveshare 5" DSI (B) Rev2.2 (WS-21973, AU $69.95). Don't buy until HDMI coexistence is tested on the box's kernel. |
| **Lid-first subtotal**                    |                             | **~AU $145–150** | deck panel added later                                                                                                                                                           |

### Must-watch gotchas (the short list)

1. **Buy Rev2.2 of the 5" (B)** — older revisions won't power up on Pi 5.
2. **Order two 22→15-pin Pi5 DSI cables** — neither panel includes one.
3. **3.3V-rail collapse on dual-DSI** — the upgraded risk; bring panels up one at a time, buy current revisions, keep X11 fallback ready.
4. **Backlight node path is unverified** for both — discover the real `/sys` path on the hardware before writing the schedule job; `bl_power` (5") unconfirmed.
5. **The 10.1" needs an aux 5V + I2C feed via the 4-pin header**, not the FFC alone.
6. **HDMI deck (leading topology): #7041 is closed/resolved and DSI+HDMI coexist under labwc/X11** — but **don't use Wayfire** (renders to one display). The Feb-2026 6.12.x HDMI regression is superseded by **kernel 6.18.34 LTS** (current Trixie), so it's likely moot on a fresh install — still smoke-test HDMI on the box's kernel. If you instead go dual-DSI, #7041 is irrelevant (no HDMI) and the 3.3V rail is the risk. Test whichever topology on the real boards + kernel.
7. **Plan X11 + `--window-position` as the primary dual-output kiosk path**, not the fallback — labwc per-output placement is flaky.

---

## What to buy / do next (screen phase)

1. **First — the bot on the Pi (no screens at all).** This is the risk-free win and the thing to do as soon as the Pi arrives: headless migration per next.md first-boot + deploy.md Phase 1, **run the agent-browser screenshot path by hand** to validate the arm64 Chromium before trusting 06:45, enable **zram** (`apt install zram-tools`, `vm.swappiness=10`), parallel-run beside the X230, then move the MUNBYN cable over. Needs no desktop, no screens — pure server. Buy the **64 GB A2 SD card** (above) for this. **Buy nothing else yet.**
2. **Bench the kiosk software on a SPARE HDMI monitor — BEFORE buying any panel.** This is the de-risk move: plug any spare HDMI screen into the Pi, install the kiosk stack (labwc + Chromium user service), and bring up `/clock` and `/panel` fullscreen. The Chromium kiosk is **identical** whether it paints a $30 test monitor or the final DSI panel — so you prove the entire software path (compositor, autologin, kiosk flags, the routes, nightly-restart timer, even dual-output with a second HDMI/monitor) for **$0 of panel spend**. You also learn whether **HDMI works on your kernel** for free, which directly informs the deck decision. Only after this works do you commit to glass.
3. **Then buy the panels.** **Lid: 10.1" DSI (C) + one 22→15-pin cable** — the one panel that's locked in (it needs the backlight schedule, DSI-only). Wire the **backlight-schedule job** (discover the real `/sys/class/backlight` node on the hardware first). **Deck: decide from the bench test** — if HDMI behaved (step 2), buy a small HDMI LCD (leading path, dodges the dual-DSI rail risk); if not, a second DSI (5" B Rev2.2) or a Pico-driven deck. Buy the deck panel last.
4. **Kiosk placement:** plan **X11 + xrandr + two `--window-position` Chromium windows** as the primary multi-output path (labwc per-output placement is flaky); per-instance `--user-data-dir`.
5. **The two mitigations that make 4 GB safe with 3 Chromiums:** a **nightly Chromium/`chota.service` restart timer**, and keep the **06:45 print in the kiosk-dark window**. With those + zram, 4 GB has comfortable headroom. Keep deck three.js light (see note above).

---

_Sources: codebase (`src/lib/server/print/snapshot.ts`, `jobs/morning-print.ts`, `agent/index.ts`, `telegram/bot.ts`, `package.json`); two Sonnet web-verification passes against Core Electronics, Waveshare wiki, PiShop, DFRobot/Freenove stores, raspberrypi/linux #7041 + #6050, and Pi forum threads on Wayland DSI backlight / dual-DSI rail / labwc kiosk placement (June 2026)._
