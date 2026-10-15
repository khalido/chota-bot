# What next

Direction + near-term plan, as of June 2026. This supersedes the scattered idea lists for "what do we actually do next" — the archives are still worth mining: [`plan.md`](plan.md) §Phase roadmap + §v3 candidates, [`tools.md`](tools.md) §Future ideas, [`audit-2026-05.md`](audit-2026-05.md) §Future Plans + §Useful Feature Ideas, [`inspiration.md`](inspiration.md).

## The direction shift (June 2026)

Phase 1 shipped and the lesson is in: **the print is the product, the dashboard isn't.** The family reads the morning receipt; nobody looks at the screen on the wall. So:

- **Print-first.** New features should make the printed brief better or add new print formats — not new dashboard screens.
- **Headless server.** The kiosk box becomes a server you SSH into, with the web UI reached from phones/laptops on the LAN when needed. Kiosk mode (Chromium fullscreen, night-dimming, auto-cycle — plan.md Phase 2) is **deprioritized**, not deleted.
- **Ambient surface = the box lid's dimmable display.** _(Revised June 2026 — originally "e-ink, later".)_ The lid carries a 10.1" DSI panel running the literary clock, dimmed on a schedule and off at night — the no-glow-after-hours contract is what separates it from the failed wall dashboard. E-ink is deferred, not dead (see §The box).
- **Physical controls over touchscreens.** The kid interaction we want is: turn a dial, press a chunky button, paper comes out. Not tapping a web UI.

## Hardware plan

Moved to [`box.md`](box.md): the Pi 5 migration, the counter-top box (screens, deck, printer bay), panel software, and what changed since June.

## Software shortlist

Roughly in order. The audit's "Highest Leverage" list, plus what the hardware direction adds:

1. **Panel control listener** — read encoder/pot + button (Pico), POST to `/api/print/[kind]`; dial-state events also feed the `/panel` deck-screen route (SSE) once the 5" screen lands. First new code the hardware needs; tiny. _Engineering crib (field research):_ pots — analog ground to the Pico's AGND pin, 8–16-sample averaging, and dead-band hysteresis per position bucket (without it the selection flickers at bucket boundaries); encoder — gray-code transition table plus a 1kΩ/22nF RC filter on CLK/DT (software debounce alone misses sub-interrupt-latency bounce).
2. **More on-demand print formats** — the WHAT dial needs positions: `today`, `joke`, `puzzle`, `shopping`, `cal`. Mostly exists as composers; fill the gaps. **Pre-generate + cache** (the strongest product finding in the field research): render briefs overnight and serve the cached PNG on button press in <5 seconds — _press → paper-in-hand_ is the whole ritual, and every surveyed project that generated at press time lost the kids during the wait. Only the `story` format generates live, where the wait is the theater.
3. **`story` print format — the dial-combination feature.** WHO dial × genre dial (positions parent-curated in `chota.config.ts`: space, dinosaurs, mystery, …) × a length switch → `POST /api/print/story` → Haiku writes ~300 words starring the dialed kid → paper. Free-text never enters; the dials constrain the prompt space, so it's kid-safe by construction. The 5–15s generation time is what the deck screen's animation is for.
4. **Tomorrow-prep print** (evening) — first event, gear, bins, weather. (audit §Highest Leverage)
5. **School holiday / pupil-free suppression** — don't print bus/class sections on non-school days.
6. **Rain-at-pickup signal** — "umbrella for pickup" beats generic weather.
7. **Sentral cookie freshness in `/admin`** — the known silent-failure path.
8. **Lid screen bring-up** — second DSI output showing `/clock` in its own kiosk window (test labwc dual-output against kernel bug #7041; X11 + `--window-position` is the proven fallback) plus a **backlight-schedule job** (evening dim, night off — sysfs writes via the same sudoers-gated helper as the deck screen). _(Deferred e-ink path, if it ever returns: `/eink/[who].png` + a stateless `uv run` push script with [pimoroni/inky](https://github.com/pimoroni/inky) — no Python server, per plan.md's `py/`-scratchpad rule.)_
9. **Agent closing line** on the morning brief — the bounded Phase 2 agent job (ToolLoopAgent is already wired).

Explicitly **not** next: kiosk-mode polish, night-dimming, dashboard widgets, generic chat surface.
