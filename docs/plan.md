# Chota — Build Plan

(formerly *home-dashboard v2*)

Family kiosk + thermal printer + (later) voice. **Chota** is the personality kids talk to — small but mighty, like Chota Bheem. Repo: `chota-bot`. Kiosk URL: `chota.local`.

v1 (Python, Streamlit, repo now `home-dashboard-v1`) languished. This is a fresh build: SvelteKit, Vercel AI SDK, file-based memory, MUNBYN over USB. Learning project. Joy + actually finishes > ship fastest.

**Why rewrite, not port:** voice is a category easier in browser TS (`MediaRecorder` + Whisper beats PyAudio/ffmpeg); v1's ~3,400 LOC is mostly thin REST wrappers (port cost ~1 day each); SvelteKit/TS already invested in for global preset.

**Not doing:** split-stack (Python + TS), full Mastra (overkill at 5 users), pydantic-ai (TS wins for voice).

`CLAUDE.md` is the agent's orientation, kept tight; this `plan.md` is the long-form reference behind it.

## Stack

Scaffolded from the global `sv create` preset (TS + Tailwind + Drizzle + better-auth + Vitest + Svelte MCP). On top of that:

```bash
npm i ai @ai-sdk/svelte zod              # agent runtime + UI streaming
npm i googleapis google-auth-library     # Calendar / Drive
npm i node-thermal-printer usb           # MUNBYN ESC/POS over libusb
npm i sharp                              # image dither (when we want it)
npm i croner                             # in-process scheduler
npm i -D @sveltejs/adapter-node          # production build target
```

LogTape (logging) + chat surfaces + rss-parser are deferred. See `docs/logging.md`, the v3 candidates section, etc.

**AI calls go through Vercel AI Gateway** — single `AI_GATEWAY_API_KEY`, model selected per task as a string (`'anthropic/claude-sonnet-4-5'`, `'anthropic/claude-haiku-4-5'`, `'google/gemini-2.5-flash-image-preview'`, `'openai/whisper-1'`). No direct provider SDKs except Groq Whisper for voice (Phase 3, direct because cheaper/faster). AI Gateway also handles fallbacks, observability, spend caps; tokens cost the same as direct.

**Why AI Gateway over direct provider SDKs:** one key for Haiku/Sonnet/Gemini/Whisper, per-task model swap, spend monitoring, provider fallback. Production pattern for multi-provider TS in 2026.

**Why `node-thermal-printer` (and the two-layer USB transport):** see `docs/printers.md`. `node-thermal-printer` builds ESC/POS bytes; the `usb` package (libusb) sends them. Bundled.

**Drizzle Studio** (`npx drizzle-kit studio`) gives a free local DB browser — useful for inspecting `jobs`, `sessions`, auth tables.

## Architecture

```
Browser (Surface Pro 5 kiosk, Chromium fullscreen)
  Multi-route UI in Svelte 5 + Tailwind v4 (tab strip):
    ├─ /          ← Dashboard cards (Clock, Bus, Weather, Calendar, Lists, Chores, PrintMorning)
    ├─ /clock     ← Literary clock — quote IS the surface, time embedded in prose
    ├─ /weather   ← Fullscreen weather
    ├─ /lists     ← TickTick lists fullscreen
    ├─ /morning   ← Morning brief preview
    ├─ /admin     ← Raw debug dumps (trips, chores, quote, config), /admin/jobs
    └─ /print/<who>?bare=1   ← screenshot target for the morning print
  Web Audio (MediaRecorder for voice — Phase 3)
        │ HTTP/SSE
        ▼
SvelteKit server routes (Node, adapter-node on Surface Pro)
  ├─ +page.server.ts loaders for each route
  ├─ /api/print/[kind]    ← morning/test prints
  ├─ /api/sentral/...     ← refresh per-kid timetable cache
  └─ /api/transcribe      ← Phase 3 — Groq Whisper

In-process scheduler (croner — see docs/jobs.md):
  Each TS file in src/lib/server/jobs/ self-registers via defineJob(name, pattern, fn).
  Lazy-discovered + booted from hooks.server.ts. /admin/jobs shows live status.

Tools (typed TS functions, runtime-agnostic — see docs/tools.md):
  weather · bus · calendar · sentral · ticktick · tmdb · apod · bootprint · chores
  Future: drive, enphase, exa, memory

External: TfNSW · Google Weather · Google Calendar · TickTick MCP · TMDB · NASA APOD
Local: sqlite (Drizzle: auth tables) · chota.config.ts · data/quotes/literary.json (vendored)
```

**MCP usage:** TickTick is consumed via TickTick's official hosted MCP at `https://mcp.ticktick.com` (raw fetch + JSON-RPC, no SDK — see `tools/ticktick.ts`). Agent tools themselves will be plain typed Vercel AI SDK tools (see `docs/agent.md`).

## Project shape

One SvelteKit project, one `package.json`. Croner runs in-process inside the SvelteKit Node server, so jobs, agent (when it lands), and HTTP routes share one process / DB / env. No microservices, no monorepo. Disk layout is in `CLAUDE.md`.

**`chota.config.ts` is the single most leveraged file.** Per-family typed config at the repo root (gitignored; `chota.config.example.ts` shows the shape). Defines kids, bus stops, chores rotations, school region, weather location, calendar IDs, activity gear lists. **The schema is the bottleneck for new tools** — adding NSW holidays, council bins, school canteen, Opal balance, after-school packing checklists each need config entries. When tempted to widen the schema for one new thing, design the next 2–3 along with it.

**Why TS at the root, not JSON in `data/`:**
- Matches the `*.config.ts` convention (svelte/vite/tailwind/drizzle).
- Types + IDE autocomplete + comments + computed values for free — no zod needed.
- Editable like code by the dev who maintains it; the hardware-kit business later can layer a JSON or web-form on top.

API keys + secrets stay in `.env` (read via `$env/static/private`). `chota.config.ts` is data, not secrets.

**Single repo, single language — with a `py/` scratchpad.** Plumbing project, not data science. TS covers it all (`fetch`, `node:fs`, Drizzle, `node-thermal-printer`, `node-usb`, `tsx` for scripts). Repo root = SvelteKit app.

`py/` is a scratchpad, **not a sidecar.** Drop self-contained Python scripts there for one-offs (data exploration, testing a Python-only library, anything pandas-y). Run with global `uv`: `uv run --script py/<name>.py`. No shared `pyproject.toml`, no IPC.

**Earned complexity** = a Python *service* (long-running, called over HTTP). Most likely candidate: Enphase if the port stalls (local gateway JWT dance, no good Node SDK). *That* gets its own subdir (`enphase-svc/` with its own `pyproject.toml`) and we refactor root → `web/`. 10 min of `git mv` when needed; don't pre-build.

## Memory architecture

**Decided: Vercel AI SDK as sole agent runtime + JSONL memory file with structured records + nightly dreaming consolidation via atomic-swap.** Full design in `docs/agent.md`. Highlights:

- `data/memory/family.jsonl` — long-term, JSONL records (id, created, tags[], content)
- `data/memory/sessions/YYYY-MM-DD.jsonl` — daily simplified agent-run transcripts (~200 chars/session, not raw)
- `dreaming.ts` job at 03:00 Sydney reads both, writes `family.jsonl.new` via Sonnet, atomic-rename only on success (Anthropic Dreams pattern — input never modified)

**Why JSONL, not markdown:** structured records give stable IDs for clean edits, free metadata (timestamps, tags), atomic appends, and lossless filtering by tag. The `content` field is still free prose — best of both.

**Why dropped pi-coding-agent:** built for coding tasks (file edits, command execution). Our agent calls typed API wrappers and writes memory notes. Doesn't need a coding-agent runtime. One SDK (Vercel AI SDK) covers it.

## Chat surfaces — deferred to v3

v2 MVP doesn't need a conversational loop. Print menu + voice + dashboard widgets cover the family interactions; each print button is one POST, not a conversation. Design notes for v3 chat surfaces are preserved in §v3 candidates.

## Auth & Google integrations

**v2 = better-auth wired with Google OAuth provider for the calendar tool.** Per-user kiosk login + admin route gating is v3 work (the auth tables/hooks/`src/lib/auth.ts` config exist already, so v3 is a config flip not a refactor). At the kiosk, anyone present uses the shared context.

**Google Cloud project setup:**
- One project, Web application OAuth client
- Authorized redirect URI: `http://localhost:8000/api/auth/callback/google`
- OAuth consent screen: external, family Gmails as test users (avoids verification gate at this scale)
- Scopes (read-only): `calendar.readonly` (family calendar) — `drive.readonly` later, scoped to one folder ID

Tokens are managed by better-auth (sign in once at `/admin`, refresh handled). No manual `scripts/google-auth.mjs`.

**v3 expansions (deferred):** per-user kiosk login, agent-proposed calendar events, agent-written Drive docs.

## Job runner & triggers

In-process scheduler — one TS file per job in `src/lib/server/jobs/`, self-registered via `defineJob()` at module top. Auto-discovered by `bootJobs()` from `hooks.server.ts`. No central dispatcher, no DB-polling tick, no `handlers.ts`. See `docs/jobs.md` for the full contract + cron pattern reference + hardening discipline.

**Why this shape (not a `jobs` table + DB-polling tick):** crontab-style files are the simplest thing that works for a single-process kiosk. Recurring jobs schedule themselves; in-memory ring buffer + `/admin/jobs` cover observability for dev. Survives SvelteKit restarts via croner re-arming on boot.

**When to add a `job_runs` table:** when we want history across restarts (e.g. "did the morning print run yesterday?" after a power cycle). Designed in `docs/jobs.md`; not built yet.

**When to upgrade to DurableAgent / Vercel Workflows:** if we ever host on Vercel and need true sleep-for-hours/days resumability with provider failover. Not needed for the local kiosk.

## v1 module ports

Most live: `weather`, `bus` (TfNSW), `calendar`, `chores`. Pending:
- `enphase.py` (cloud auth + local gateway JWT dance) — port carefully OR run as tiny Python `uvicorn` service if it tar-pits. **Targeted split-stack for one module is fine.**
- `dashboard_image.py` — dropped the Gemini PNG path; v2 is Tailwind components. Salvaged: data-aggregation logic + imminent-event detection. PNG generator moved to v3 candidates.

## Phase roadmap

### Phase 1 — Morning print  ✅  (May 2026)

End state: 06:45 every weekday, the printer fires with weather + bus + chores + per-kid Sentral schedule, plus the family brief. Built and shipping.

What changed from the original M0/M1/M2 plan:
- **Restructured the brief into a GUS-style sheet** — `CHOTA` masthead, numbered sections (`01 WEATHER`, `02 TODAY`, …), 12-hour compact times, left-aligned. The old shape (text rules, all-caps, no sections) is in git history.
- **Two render paths** — plain text via `composeText('morning')` for the always-works fallback; HTML→image via `agent-browser` screenshotting `/print/<who>?bare=1` for the production "designed" path. See "Two render paths" below.
- **Multi-recipient prints** — family brief + per-kid briefs (kids weekdays only). Each recipient is a `/print/<who>` route; the morning-print job loops over enabled recipients and prints in sequence.
- **Better-auth Google OAuth** wired (replaces planned manual `googleapis` token flow) for the calendar tool.
- **Job runner** is per-file `defineJob()` not a DB-polling tick.
- **`KIOSK=true` env gate** so jobs that touch hardware (the morning print) no-op on dev machines.

### Phase 2 — Useful kiosk

End state: a kiosk you actually look at + a print menu with several formats + the agent loop landed.

- Multi-screen kiosk in Svelte + Tailwind. Tab strip; tap or swipe between screens. Auto-cycle option later.
- **Print menu** — buttons per recipient + per format: `Today`, `<Kid1>`, `<Kid2>`, `<Kid3>`, `Cal`, `Joke`, `Crossword`, `Puzzle`, `+`. Button → `POST /api/print/<kind>`.
- **Basic agent loop** — `runAgent()` wrapper per `docs/agent.md`, read-only tools only, behind a feature flag with strict timeout + step caps. First agent job: the closing line on the morning brief (until then a static "Have a good day, kids -- Chota" sign-off). **No memory writes in Phase 2** — do more research on the memory-tool design first (moved to Phase 3, see below). Keeping the Phase 2 agent stateless makes it a small, safe target.
- **More tools** — `drive`, `exa` (web search), NSW school terms / public holidays, council bin night, school canteen menu, Opal/school transport balance.
- **`/clock` polish** — already have the literary clock dataset (`data/quotes/literary.json`, vendored from `~/code/pi-pico-clock` via `scripts/sync-quotes.mjs`, 24h `HH:MM` keys). Add Urdu/Pakistani shers as `lang: "ur-roman"` entries; add `data/quotes/family.md` for hand-edited family quotes; fallback chain: `literary[hhmm]` → `family.md` → Quotable API.
- **Tomorrow lookahead on the morning print** — one extra line on the family brief: `tmrw: <events>`, density-tiered so it never overflows. 0–2 events: full titles. 3–5 events: acronym-extract multi-word titles (`Volleyball training` → `VBT`), truncate single-word ones to N chars where N is computed from the line budget. 6+ events: just `tmrw: 7 events` — at that density the abbreviations stop being distinguishable. Implementation: `compressEventTitle(title, maxChars)` + `tomorrowLine(events)` helpers in `print/sections.ts`, ~30 LOC + snapshot tests. Acronym extraction beats vowel-removal for readability on calendar event names (which tend to be `Person Activity` or `Activity Type`).
- **Night mode** — two layers because CSS alone doesn't dim the backlight. (1) **CSS filter:** extend the existing Sydney-hour pre-paint script in `app.html` to also add a `night` class after, say, 21:00; `html.night { filter: brightness(0.4) grayscale(1) }` wraps everything cheaply with no per-component changes. (2) **Backlight:** a Chota cron job (`night-brightness.ts`) writes to `/sys/class/backlight/intel_backlight/brightness` (Surface Pro 5 device) at 21:00/06:00. Needs `ko` in the `video` group (or a udev rule for the backlight device). The CSS layer is the visual win; the backlight layer is what makes the SP5 actually disappear into the wall at night.
- **Logging + observability** — wire LogTape in place of the thin `log()` wrapper: console + rotating file sinks, plus a best-effort, non-blocking OTel sink shipping to Axiom over OTLP. OTel keeps it vendor-neutral (the backend is just an endpoint — a reusable logging pattern across projects). Structured wide-events. The real payoff is one alert: morning-print failure / canvas-fallback → phone. See `docs/logging.md`.
- **Kiosk mode** — on boot, launch Chromium fullscreen pointed at the dashboard. Not an OS lockdown — the Cinnamon desktop stays running underneath so Alt-Tab / app-switching still works (the box is a normal multi-use machine: it also runs the Chota server + agent-browser). Four small things, no framework: (1) `chromium --kiosk --noerrdialogs --disable-translate http://localhost:8000` — fullscreen + chromeless. (2) **Cinnamon autostart** — `.desktop` file in `~/.config/autostart/` running that on login. (3) **Auto-login as `ko`** — Mint Login Window settings. (4) **`unclutter`** — `apt install unclutter` to hide the idle cursor. Plus screensaver/lock disable: `gsettings set org.cinnamon.desktop.screensaver lock-enabled false; gsettings set org.cinnamon.desktop.session idle-delay 0; xset s off; xset -dpms`. Skip Electron/Tauri/Balena/WPE — the app is already a server, wrapping a browser around a web app is doubled work. Hardware-agnostic: SvelteKit + adapter-node + agent-browser all run on a Raspberry Pi 5, so the SP5 (fiddly long-term) can be swapped for a cheaper Pi-and-screen later — nothing in the stack is tied to the Surface.

### Phase 3 — Voice + polish

- **Voice** — `MediaRecorder` push-to-talk → `/api/transcribe` → reply printed/typed. Groq Whisper direct (cheapest/fastest); offline fallback `whisper.cpp`. Stretch: speech-out via [AI SDK `speech`](https://ai-sdk.dev/docs/ai-sdk-core/speech), gated behind a kiosk "voice mode" toggle (ambient TTS gets old fast).
- **Memory + dreaming** — custom memory tool wrapping `data/memory/family.jsonl` (agent reads + writes), plus the 03:00 Sonnet consolidation job (atomic-swap pattern, see `docs/agent.md`). Held back from Phase 2 because nightly file rewrites are the highest corruption-risk path in the system. Before building: settle the memory-tool design — single-writer lock so daytime `memory.add` can't race the 03:00 swap, and injection-aware boundaries once `exa` web content can reach memory.
- **Port the rest** — `enphase`. News ticker (`rss-parser`) on dashboard.

## Print formats — Daily Shout + on-demand menu

The Daily Shout is the auto-scheduled morning print at 06:45 (weekdays only for kid briefs; family brief every day). The kiosk's Print Menu screen has buttons for *many other formats*, all using the same `/api/print/<kind>` route. Format catalogue grows over time.

**Auto-scheduled:** `today` (the morning print).

**On-demand (kiosk button):**
- `today` — same as scheduled, force-print
- per-kid briefs (`/print/<who>`) — today's calendar items + their chore + Sentral school timetable + a kid-tuned joke or fact (memory files for tuning, when agent lands)
- `cal` — week-ahead family calendar
- `joke` — kid-friendly joke (Haiku via Gateway)
- `crossword` — 5×5 mini, agent-generated from per-kid topic
- `puzzle` — Sudoku or word ladder
- `+` (custom) — user types a description, agent composes and prints

Each format lives in `src/lib/server/print/<kind>.ts` — small files, easy to add.

### Two-stage composition (Daily Shout)

The Daily Shout is composed in two layers:

1. **Deterministic body** — pure TS in `src/lib/server/print/morning.ts`. Calls tools (`getWeather`, `getBus`, `getCalendar`, `getList('shopping')`, `getSchedule(kid)`), builds a fixed-shape `MorningData`. Same input → same output. Easy to test and reason about.
2. **Agent closing** — the cron job will eventually call the agent for 1–3 closing lines given the body + memory + a calendar lookahead. Output is appended before printing. Until the agent lands, a static "Have a good day, kids -- Chota" sign-off is fine.

The agent never edits the body. Its job is to add a final useful sentence — usually friendly fluff, occasionally a real flag ("Kid2: exam Wednesday — start review tonight"). Memory + tools mean the agent can spot context the deterministic body misses.

**Failure handling for the agent call.** AI Gateway's multi-provider fallback (Anthropic → OpenAI → Google) covers most provider-side flakiness. Remaining failure modes (NBN outage, Gateway down, timeout exceeding the print window) are handled by `try/catch` in the job handler — falls back to the static closing on any error and prints the deterministic body either way. Five lines of code, no caching layer, no separate pre-generation job. The kids never see an empty printer.

### Format rules

- **ASCII-only body content.** No em-dashes, smart quotes, emoji, or non-Latin glyphs in the plain-text path. Thermal printers default to CP437; anything else renders as boxes. Use `--`, `*`, plain `'`. (The HTML→image path bypasses this since it embeds a font; but the plain-text fallback needs it.)
- One long receipt, **no auto-cut between sections** (per HN: "let kids tear it themselves; scroll accumulates as archive").
- Sharp 1-bit dither for any images (lesson: dither before sending, not in `node-thermal-printer`).
- Multi-chore per kid is fine (chart-driven, e.g. dishes + dog on the same day).
- Family-room placement means the morning briefing also serves as ambient family context, not just "before the bus" timing.

### Two render paths: plain text and HTML→image

The morning content is gathered once by `gatherMorning()` → `MorningData` (raw weather lines, calendar events, bus trips, chores, due-soon tasks, puzzle, shopping, per-kid Sentral schedule). Two renderers consume it:

1. **Plain text** (`composeText('morning')` → string → `printText()`) — ASCII, the canonical debuggable form. `printText` word-wraps each line to the active built-in font's column width. The simple, always-works fallback.
2. **HTML → image** (the "designed" path) — `/print/<who>` is a SvelteKit route styled with Tailwind + IBM Plex Mono (self-hosted in `static/fonts/`, Medium weight to survive the thermal head), built to fixed `576px` width (the 80mm head @ 203dpi). `agent-browser` screenshots it: `set viewport 576 <h>`, `open <url>?bare=1`, `screenshot --full <path>` → PNG → `printPng()` (which feeds it to `node-thermal-printer`'s `printImageBuffer` for dither + ESC/POS raster). `?bare=1` strips the dashboard nav so the screenshot is clean. Production morning print uses this. Gotcha: `agent-browser screenshot --full` doesn't auto-extend past the viewport height — `eval document.body.scrollHeight` first and size the viewport to it.

There's also a parallel `render.ts` that hand-draws the receipt with `@napi-rs/canvas` (no browser) — kept as a fast fallback and for the `test` ruler print.

Why HTML→image: any typeface, CSS boxes/rules/icons, "just write lines and let it wrap" — the design surface is Tailwind, not canvas math. Trade-off: bigger payloads (~50–80 KB raster vs ~600 B of text), needs a browser. For a once-a-day print that's fine.

### Multi-recipient prints + component model

- **Recipients, not multi-user.** No per-user auth or data isolation — everyone sees everything in `/admin`. Each recipient is a named print config; the system maintains all the per-person content internally. Currently: `family` (the original Daily Shout) + per-kid briefs from `chota.config.ts`.
- **Routes:** `/print` shows all configured recipient briefs side by side. `/print/<who>` (e.g. `/print/family`, `/print/<kid>`) is the individual print-target page; `agent-browser` screenshots each `?bare=1` and prints it.
- **`/admin` toggles** who gets a printout (and eventually which components each recipient's brief includes).
- **Component library** — eventually ~12 print components: weather, today's calendar, bus, chores, school timetable, shopping, due-soon, puzzle, joke, math, quote, … Each recipient config picks which. Per-kid "surprise slot": pick N candidate components and the print renders one at random each day.
- **The print job** loops over enabled recipients, renders each, prints in sequence (the printer mutex serialises them).

**Per-person school timetable — Sentral.** The kids have NSW DoE student logins to Sentral. Daily timetable (classes + rooms) lives under `https://<school>.sentral.com.au/s-xxxxxx/portal/#!/timetable/...`. Login is plain email + password (no 2FA). The `sentral` tool fetches the .ics export with the stored session cookie, caches at `data/sentral/<who>-timetable.ics`, and `getSchedule(person)` returns today's periods. Cookie expires periodically — re-copy via `.env` and restart.

## Ditched on purpose

Things v1 has that v2 should *not* recreate without explicit need:

- **MCP server pattern.** Tools are plain TS functions. Mario Zechner's argument applies: tools-as-functions with good docstrings are cleaner than MCP for in-process agents. ([Why no MCP in pi](https://mariozechner.at/posts/2025-11-02-what-if-you-dont-need-mcp/))
- **Multi-user sessions and per-user memories.** Family kiosk = shared context, not switched accounts.
- **Streamlit + Textual prototypes.** Single dashboard, single UI surface.
- **v1's `agent/tools/` two-layer pattern** (tool wrapper + API call). v2 splits by *purpose*, not by abstraction layer: `src/lib/server/tools/<domain>.ts` is the tool implementation; `src/lib/server/agent/{system-prompt,tools}.ts` (when it lands) is the agent-runtime registration.
- **Multiple databases / DB setup scripts.** Drizzle migrations from day one.
- **CLI agent.** Kiosk + chat + Telegram cover all interaction surfaces. CLI was for dev; v2 has `npm run dev` and Vite HMR.
- **Knowledge base directory (`data/knowledge/`).** Was speculative. If FAQs matter, surface them as tools, not files for the agent to grep.

## Risks / gotchas

**Hardware:** see `docs/printers.md` for MUNBYN specifics (USB IDs vary per unit, macOS CUPS conflict, Linux udev rule, Windows Zadig). General reminders:
- Thermal paper fades in months under light/heat. Use BPA-free thermal paper (skin contact concern for kids). Don't promise "keep this forever" features.
- `type: PrinterTypes.EPSON` (MUNBYN is an Epson TM-T88 clone). Width = `48` chars for 80mm at default font.

**Software:**
- **Enphase auth is the highest-friction port.** If it stalls, run it as a tiny Python `uvicorn` service. Targeted split-stack is fine; full split-stack is not.
- **Telegram bot moderation:** whitelist family chat IDs only. Do *not* rely on LLM moderation for inbound — the public Message Maddie incident is a cautionary tale. If grandparent web form ships, gate by `better-auth` magic-link or shared secret.
- **AI SDK is moving fast.** API changed a few times in 2025. Pin versions in `package.json`, expect mild churn.

**UX:**
- **Don't let the agent write chores.** Parents curate the chore list; agent just formats. LLM-generated busywork lands badly with kids.
- **Auto-cut between sections is the default temptation** — resist it. One scroll per morning.
- **Voice in a noisy kitchen/family room is hard.** VAD, push-to-talk button, or wake-word are different UX choices. Start with push-to-talk.

## Sandboxing & blast radius

The agent (when it lands) will have file tools — `Read`/`Write`/`Edit`/`Bash` give it the same blast radius as the user running the SvelteKit process. **For v2 MVP this is fine** — the kiosk box is a personal kiosk, not a precious machine, family is trusted, no untrusted input enters the agent loop except via Telegram (whitelisted family chat IDs) and the kiosk page (in-home).

**Free hygiene — do this anyway, costs nothing:**
- Agent `cwd = data/memory/`, **not the repo root**. Agent's view of the world should be data, not source.
- `.env` outside the agent's cwd. Read env vars in code via `process.env`, never expose the file to file tools.
- Run from a built bundle (`adapter-node` output), not the source tree — source code stays read-only from the agent's perspective.
- Memory files (`data/memory/*.jsonl`) are agent-writable by design; nothing else in the project should be.

**When to actually sandbox:**

| Migration | Sandbox needed? | Approach |
|---|---|---|
| **Kiosk box (now)** | No | Free hygiene above. Trust the family. |
| **Mac Mini M4 (future)** | No | Same trust model, more compute. Same answer: scope `cwd`. |
| **Railway / cloud host** | **Yes** | Container-level isolation comes for free with Railway. Don't expose more than `/api/*` publicly. |
| **Public web form** (grandparent notes) | **Yes for that surface** | Don't let untrusted input feed into the same agent loop the trusted kiosk uses. Separate route, separate scope, output sanitized before printing. |
| **Web-fetch / arbitrary URL access by agent** | **Yes** | Untrusted content is the classic prompt injection path. |

## Operations

The boring stuff that bites if not planned.

### Auto-start on boot

Linux + systemd. `deploy/chota.service` is committed; `sudo cp` once to `/etc/systemd/system/`, `daemon-reload`, `enable --now`. Auto-restart on crash, auto-start on boot. See `docs/deploy.md`.

### Backup of `data/memory/`

When the agent lands, `data/memory/` becomes the most precious artifact. One misbehaving agent + bad nightly run = `family.jsonl` gone, no rollback. Plan:
- **Nightly:** `git -C data/memory commit -am "$(date -I)"` against a local bare repo. No remote needed; `git log` + `git show` is enough. Trivial rollback.
- **Weekly:** rsync `data/memory/` + `data/home.db` to a NAS or external drive.
- Both wired as croner jobs in `src/lib/server/jobs/`.

### Failure alerting (the empty-printer-at-06:45 problem)

Silent kiosk failure = kids stare at empty printer = you find out at 7am from the wrong end.
- LogTape to `data/logs/chota.log` (rotating). On `morning-print` failure → Telegram DM to the parent via the family bot.
- Optional 06:50 watchdog job — if 06:45 print's row isn't `done`, alert.

### Internet-out posture

Sydney NBN flakes. Be explicit about degraded mode:
- Agent loop fails on Gateway / provider error → kiosk shows last cached dashboard image + "I'm offline, back soon."
- Bounded retry then visible failure — don't drain Gateway spend on transient errors.
- Daily Shout: if 06:45 fails on internet, retry once at 07:00. Then bail with alert.

### Memory-edit feedback loop

Cheap evals signal: a "that wasn't right" button on the kiosk + `/wrong` command in Telegram.
- Logs the previous turn + reason to `data/memory/feedback.jsonl`.
- Dreaming session reads it; agent reflects on its own mistakes that night.
- Highest-leverage feature relative to LOC.

### Spend posture

- AI Gateway dashboards for Anthropic/Gemini/etc. spend.
- Direct Groq billing for Whisper.
- Soft cap alert at $20/month combined; hard kill switch if any single day > $5.
- Dreaming session cost estimate: ~$0.10–0.30/night with Sonnet → ~$40–110/year. Acceptable, but log per-night cost in the job result so we see drift.

### Diagnostics digest (pattern stolen from `refs/yaad`)

`src/lib/server/diagnostics.ts` exports a `weeklyDigest()` (and `dailyDigest()`) that pulls from the DB and returns formatted markdown. **Pure code, zero LLM cost.** Complements the dreaming session: dreaming is "what did the agent learn?" (LLM-driven memory), diagnostics is "what did the system do?" (deterministic, fast, free).

Sunday 7am scheduled job: print a tiny receipt. Example:

```
WEEK OF MAY 6
─────────────
Daily Shouts: 5/5 ✓
Joke prints:  4
Crosswords:   3
Failures:     1 (Tue 06:45 — bus API timeout)
Gateway:      $0.87
Sleep tight 💤
```

Kid sees it weekly; parents get a "kiosk healthy?" signal without reading logs. Same module powers a `/api/admin/digest` endpoint for on-demand HTML view.

## Frameworks & approaches considered

Captured so future-you knows what was evaluated and why we landed where we did.

| Option | Type | Verdict | Why |
|---|---|---|---|
| **Vercel AI SDK + AI Gateway** | TS toolkit | **Chosen — sole runtime** | One SDK for agent + streaming UI + non-agent pipeline calls. AI Gateway value (one key, per-task model selection) is native. Custom memory tool is ~50 LOC. See `docs/agent.md` |
| **pi-coding-agent** (badlogic/pi-mono) | TS coding-agent SDK | **Considered then dropped** | File tools built in, skills system, production-tested. Built for code-writing/shell-running agents. Our agent only calls typed API wrappers + writes memory notes — coding-agent runtime is overkill |
| **Mastra** | TS framework | Not adopted | Strongest framework competitor. Bundles agent + memory (`LibSQLStore`) + workflows + RAG + evals + observability. Has SvelteKit guide. Skipped: opinionated about owning the loop; for *learning*, primitives beat pre-built. Revisit after 6 months — for *work* projects this might be the better default |
| **Claude Agent SDK** | Coding-agent SDK (Anthropic) | Rejected | "Claude Code as a library" — Anthropic-only, ships `claude` binary, defeats multi-provider goal. v1 used the Python variant; we already escaped it |
| **pydantic-ai** | Python framework | Not chosen | Solid Python alternative. Skipped because we're going TS for voice + frontend ergonomics |
| **Letta** (formerly MemGPT) | TS+Py framework | Not chosen | Server-first — agent lives inside Letta's runtime. Replaces, not augments. Docker overhead disproportionate for 5 users |
| **Mem0** | Memory framework | Pattern stolen | OSS path needs Qdrant sidecar. Operational friction not justified. **Pattern worth copying:** LLM extraction pass per turn → discrete facts in DB. We do this with Haiku + sqlite, no vector DB |
| **Zep / Graphiti** | Memory framework | Not chosen | Self-hosted CE deprecated; cloud-only or BYO Neo4j. Bi-temporal graph (preferences-over-time) is clever; we approximate with `superseded_at` column |
| **DurableAgent + Vercel Workflows** | Durable runtime | Future option | Right answer for long pause-and-resume flows ("wait 10 min for kid reaction"). Local jobs cover our case until we move to Vercel infra |
| **Inngest / Temporal** | Durable runtime | Future option | Vercel-endorsed alternatives. Same calculus as DurableAgent — overkill for local kiosk |

**Net:** Vercel AI SDK as the sole agent runtime — `generateText({ tools, stopWhen })` for short-lived agent jobs (per `docs/agent.md`), AI Gateway for multi-provider routing, custom memory tool wrapping JSONL. Groq direct for voice (Phase 3). The "no framework" tax is ~80 LOC across `scheduler.ts` + `runAgent.ts` — exactly the part worth understanding ourselves.

**Patterns to borrow:**
- `~/code/khalido.dev/` — proves pi/Vercel AI SDK embeds cleanly in SvelteKit. Mirror its `src/lib/agent/` + `src/lib/server/llm.ts` shape.
- `~/code/pi-pico-clock/` — quote source for the clock screen → `data/quotes/literary.json` (vendored).
- `refs/pi-autoresearch/` — JSONL log + living markdown precedent.
- `refs/jabberwocky/` — file-based memory in production.
- `refs/yaad/` — `daily_digest()` pattern (pure-code ops report, no LLM).
- `karpathy/autoresearch` — "one file, one metric, keep looping" if we ever eval the morning shout.
- `refs/chat/` (Vercel Chat SDK) — v3 reading.

## Reference links

- [Vercel AI SDK docs](https://ai-sdk.dev/docs) — sole agent runtime + non-agent calls
- [Vercel AI SDK custom memory cookbook](https://ai-sdk.dev/cookbook/guides/custom-memory-tool)
- [Vercel AI Gateway docs](https://vercel.com/docs/ai-gateway) — multi-provider routing
- [Mastra](https://mastra.ai/) — framework backup (revisit for work projects)
- [Claude Managed Agents memory](https://platform.claude.com/docs/en/managed-agents/memory) — same file-mount pattern, useful reference
- [`pi-observational-memory`](https://github.com/elpapi42/pi-observational-memory) — in-session continuous memory with mechanical compaction. Key insight: compaction should *append*, never LLM-rewrite, to avoid drift
- [Vercel Chat SDK docs](https://chat-sdk.dev/docs) — v3 reading
- [Vercel AI SDK transcription](https://ai-sdk.dev/docs/ai-sdk-core/transcription) + [speech](https://ai-sdk.dev/docs/ai-sdk-core/speech) — Phase 3 voice
- [`whisper.cpp`](https://github.com/ggml-org/whisper.cpp) — offline voice fallback
- [Vercel Workflows docs](https://vercel.com/docs/workflows) — future option for durable flows
- [Better Auth Google provider](https://better-auth.com/docs/authentication/google)

## v3 candidates (deferred from v2)

Cut from v2 to keep scope honest. Bring back when v2 is stable.

**Conversational chat (the big one):**
- **Kiosk chat screen** — fourth tab in the multi-screen UI. SvelteKit `Chat` from `@ai-sdk/svelte`, agent runtime on the same loop the print menu already uses.
- **Telegram bot** — gramio + long polling + voice-via-Groq-Whisper. Decisions captured in `docs/telegram.md`.
- **Sandboxed mini-app arcade via Telegram Mini Apps** — coding agent (Claude Agent SDK or pi-coding-agent in a Vercel Sandbox isolate) builds small HTML/JS games on request ("Chota, build me sudoku"), bot serves them as Telegram Mini Apps. Hosting needs Tailscale Funnel (Mini App URLs must be public HTTPS). Defer until Phase 3 voice + Phase 4 chat are stable. See `docs/telegram.md` §Future.
- **Google Chat in family Space** — hits Google's OAuth verification gate + service account install requires Workspace admin. Revisit if family migrates to Workspace.
- **Grandparent web form** at `/g/<token>` for note-drops without Telegram.

**Other deferred:**
- **Gemini-generated dashboard image** (v1's approach in `dashboard_image.py`). v2 went pure Tailwind. The Gemini path is fun for "share a family snapshot card" or "print today's image at the top of the receipt" — both v3 features.
- **DurableAgent + Vercel Workflows.** Local jobs cover v2.
- **News ticker (RSS via `rss-parser`).** Skip until kiosk is stable; reactivate as a ticker widget.
- **Agent-proposed calendar events.** Read-only Calendar is plenty for v2. Phase 2: agent proposes, family approves via kiosk button or Telegram, agent creates.
- **Bank-balance announcements / "family climb fund" tracker.** Cool blueprint idea, niche enough to defer.
- **Multi-provider agent loop with mid-session model switching.** Single-model is fine for v2.

## Reference notes from v1 worth keeping

- `dashboard_image.py` cleanup algorithm: keep all images last 24h, then alternate-keep older ones. **Bug to fix when porting:** never bounded the recent-24h window. At 5min refresh that's 288 PNGs/day. Cap it.
- Model selection rule (still applies): use `claude-haiku-4-5` for cheap formatting (weather/bus summaries), `claude-sonnet-4-5` for the agent itself, `claude-opus-4-7` only when reasoning is hard.
- v1's `permission_mode="default"` was an anti-pattern for a kiosk — caused interactive approval prompts. v2 doesn't have this concept (Vercel AI SDK doesn't enforce permission gates), but be mindful when wiring tools that mutate state (printer, calendar add).
