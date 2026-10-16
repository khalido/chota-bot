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

## Agent tools, the brief, and pushes (review 2026-10-16)

From a code review of the agent tools and print pipeline, plus a look at what people run on OpenClaw-style family bots (mostly vendor blogs, little first-hand). The agent is now a fast model, so tools carry the weight.

**Agent tools, in order:**

1. ~~`bus`, `ticktick_add` (with a `due` date for the buying list), `chores`, calendar `search`~~ — built 2026-10-16. `school_day` and `school_dates` too. Ticking items off needs a title→ID lookup first (TickTick's REST search, see kotools).
2. **Personal layer** — per-person prompt files so chota can take over KO's yaad bot ([`memory.md`](memory.md) §Prompt layers). yaad's other pieces KO uses: reminders/scheduled jobs (the biggest gap), a dated personal stream with todos, saved links and content, news feeds, morning briefing.
3. **Reactions and the group gate** — [`whatsapp.md`](whatsapp.md) §How it fits chota.
4. **Artifacts** — quick phone-friendly pages built from a chat ask, published at `<word>.<domain>`, one-time-token login. Idea: [`artifacts.md`](artifacts.md).
5. **`print`** — see [`agent.md`](agent.md) §Channels, commands and actions.
6. **Errors and staleness as data** (calendar, bus and list-add now return `{ error }`). `getWeather()` throws straight into a tool-error (only the beach call is caught, `agent/tools/weather.ts:22`); return `{ error }` instead. Add `asOf`/`stale` from the planned `withTtl` cache.
7. **Output nits:** calendar dates need an ISO `ymd` (today "Thu 21 May", no year); cap `query` results; units in names (`waveHeight` → `waveHeightM`); one summary per domain, not three; tmdb `year` + 2–3 alternatives.
8. **Prompt:** ~~bullet lists allowed (one level)~~ done; split the five-rules-in-one search bullet; say the snapshot shows the first 5 items.

**The printed brief** — the family likes it; protect one sheet per person at 06:45, sections that drop out rather than fail, and SCHOOL right after weather. Don't add a section without removing one.

- **Say when a source failed.** `gatherBrief` turns failures into empty sections, so an empty TODAY on a bad morning reads as a free day. One footer line ("calendar unavailable") when a leg failed.
- **Missing weather prints as 0** (`weather.ts:124`) — print "--".
- **Jobs that partly fail report ok** (handover step 3) and a missed 06:45 has no catch-up: add a 07:00 check-and-reprint, and a Telegram line on failure or canvas fallback.
- **One-line additions that earn their space:** bins / "bring X" from the calendar, rain or sports-kit nudges (extend Sentral's "Take sports stuff!"), overdue kid tasks first.
- **Paper length:** each sheet prints the full chores rota and shopping list. Own chores only on personal sheets is a trim to try — KO's call, since it changes a design the family likes.
- The reviewer advises against an agent closing line (shortlist #9 above); decide before building it.

**Pushes**, ranked by usefulness for the effort:

1. **Morning family-group message** — [`whatsapp.md`](whatsapp.md) §The morning message. Only what changes someone's day; silent when there's nothing.
2. **Threshold pings to one person** — "leave now, 501 in 6 min", "rain at pickup". Existing bus and weather data plus a job; only when a threshold trips.
3. **Capture from chat** — "Kid2 has ballet Thursday 4pm" → calendar draft, "we're out of milk" → list. Confirm before writing; answer only when addressed.
4. **School notices in** — forward an email or photo → calendar drafts + a "bring X" line on that kid's sheet. Untrusted content: read-only tools while parsing.
5. **Sunday roundup** — next week's clashes, open lists, fixtures, term dates; reuses the weekend-sheet composer.
6. **Expiry reminders** (rego, warranties, renewals) from the family memory folder.

What goes wrong for others: bots that talk too much in groups, invented details, agents that explain instead of doing, and prompt injection from forwarded content. Add one push at a time and live with it for a week or two.

Explicitly **not** next: kiosk-mode polish, night-dimming, dashboard widgets, generic chat surface.
