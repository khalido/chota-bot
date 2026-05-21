# Chota

Family kiosk + thermal printer running on a Surface Pro 5 w/Linux, MUNBYN ITPP098P over USB.

**Status:** Phase 1 shipped. The thermal printer fires twice a day — 06:45 (today's brief) and 19:15 (tomorrow's brief) — with weather + bus + chores + per-kid School schedule. Phase 2 = agent loop; Phase 3 = voice.

## Day-to-day

```bash
npm run dev        # http://localhost:8000/  (vite.config.ts pins the port)
npm test           # vitest --run (102 tests, fast)
npm run check      # svelte-check (type errors)
npm run lint       # prettier + eslint
npm run build      # adapter-node → build/index.js
```

The live dashboard runs on the kiosk box at **`http://sp5.local/`** (home LAN) — a Caddy reverse-proxy service maps port 80 → the app on :8000, so there's no port to type. Deploy is manual SSH-from-Mac (`npm run deploy`) — see [`docs/deploy.md`](docs/deploy.md).

## First-time setup

1. `cp chota.config.example.ts chota.config.ts` — fill in your family details (real names live here only; never in tests/docs/code)
2. `cp .env.example .env` — fill API keys (Transport NSW, Google, TickTick, etc.)
3. `npm install`
4. (Print pipeline only) `npm i -g agent-browser && agent-browser install` — downloads the bundled Chromium used to screenshot `/print/<who>?bare=1` into the PNG that goes to the thermal printer
5. (Kiosk only) plug in MUNBYN, confirm USB IDs with `node scripts/printer-test.mjs visible` — see [`docs/printers.md`](docs/printers.md)

## Stack

- **SvelteKit** TS, Tailwind, adapter-node — UI + API in one process
- **Drizzle + better-sqlite3** at `data/home.db`
- **Better-auth** Google OAuth (used by the calendar tool)
- **Vitest** unit tests + inline-snapshot tests for print formats
- **croner** auto-discovered jobs (one file per job in `src/lib/server/jobs/`) — see [`docs/jobs.md`](docs/jobs.md)
- **node-thermal-printer + node-usb (libusb)** — see [`docs/printers.md`](docs/printers.md)
- **Vercel AI SDK + AI Gateway** — agent runtime (planned; see [`docs/agent.md`](docs/agent.md))
- **LogTape** — structured logging at `$lib/server/log.ts` — see [`docs/logging.md`](docs/logging.md)

## Where things live

```
chota.config.ts          # per-family config (gitignored). Real names ONLY here.
chota.config.example.ts  # committed reference shape — uses placeholder names

src/
  routes/                # pages (/, /clock, /weather, /lists, /morning, /admin, /print)
  lib/components/        # Svelte UI (Clock, Weather, Calendar, Bus, Lists, Chores, PrintMorning)
  lib/components/print/  # BriefSheet — the screenshot-target sheet for the printed briefs
  lib/server/
    config.ts            # loads chota.config.ts → getConfig() / findKid()
    chores.ts            # daily rotation lookup
    tools/               # weather, bus, calendar, sentral, ticktick, tmdb, apod, bootprint
    print/               # brief + weather-block + sections + composers + render + snapshot + printer
    jobs/                # croner-scheduled jobs (auto-discovered; one file = one job)
    db/                  # Drizzle schema + client
    auth.ts              # better-auth config
    log.ts               # LogTape structured logging

deploy/                  # production deploy: deploy.sh + chota.service
scripts/                 # ad-hoc / exploratory (printer-test, sync-quotes, *-explore)
data/                    # runtime state — gitignored except data/quotes/
docs/                    # plan, deploy, printers, jobs, logging, agent, tools, weather, ...
```

## Conventions

- **Don't put real family names anywhere except `chota.config.ts`.** Tests, docs, deploy scripts, comments — all use placeholders (`Kid1/Kid2/Kid3`, `Parent1/Parent2`). Real names get pulled from config at runtime.
- **New tool:** one file in `src/lib/server/tools/<domain>.ts`. Routes/jobs import directly. The agent registry will live in `agent/tools.ts` once the agent lands.
- **New print format:** one file in `src/lib/server/print/<kind>.ts` + composer registration in `composers.ts` + button in `routes/admin/print/+page.svelte`.
- **New job:** drop a TS file in `src/lib/server/jobs/`, call `defineJob(name, cron, fn)` at module top. Auto-discovered — see [`src/lib/server/jobs/CLAUDE.md`](src/lib/server/jobs/CLAUDE.md).
- **Per-family data:** add a typed field to `ChotaConfig` in `src/lib/config.ts`, fill in both `chota.config.example.ts` and your real `chota.config.ts`. No JSON files, no zod — TypeScript catches shape mismatches at compile time.
- **AI calls** through AI Gateway (one key) except voice transcription (Groq direct).
- **Auth** — Google OAuth (better-auth) on `/admin` for the calendar tool's Google connection. A simple PIN screen to gate the dashboard may land later; nothing else is route-gated today.

## Where to read more

- [`docs/plan.md`](docs/plan.md) — long-form architecture + framework decisions + risks. Read when something's unclear.
- [`docs/deploy.md`](docs/deploy.md) — the deploy ritual + first-time bootstrap on the kiosk box.
- [`docs/jobs.md`](docs/jobs.md) — job system, cron patterns, hardening.
- [`docs/printers.md`](docs/printers.md) — thermal printer primer + per-printer USB/driver notes.
- [`docs/tools.md`](docs/tools.md) — tool roadmap (built + planned + API keys checklist).
- [`docs/agent.md`](docs/agent.md) — agent integration spec (pre-implementation).
- [`docs/telegram.md`](docs/telegram.md) — Telegram bot design (Phase 3, pre-implementation).
- [`docs/logging.md`](docs/logging.md) — LogTape structured logging: design + what shipped.

---

## Project Configuration (sv create)

- **Language:** TypeScript · **Package Manager:** npm
- **Add-ons:** prettier, eslint, tailwindcss, mcp (Svelte), vitest (unit), drizzle (sqlite + better-sqlite3), better-auth (scaffolded with the password preset; Google OAuth wired on top — see Auth note above)

---

## Svelte MCP server

Use the official Svelte MCP server for Svelte 5 / SvelteKit work — and always run `svelte-autofixer` on Svelte files you write, until clean.
