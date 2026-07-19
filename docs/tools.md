# Tools roadmap

Tools = typed TS functions in `src/lib/server/tools/<domain>.ts`. One file per data source. Each tool is a small async function returning a flat JSON-friendly object. Routes and jobs call tools directly; the agent registers a subset (weather, calendar, ticktick, tmdb + google_search) via thin wrappers in `src/lib/server/agent/tools/`.

## Status

### Done (live)

| Tool          | Purpose                                                                                                | Where                  | Keys / config                                                                      |
| ------------- | ------------------------------------------------------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------- |
| `weather`     | Google Weather: current + 48h forecast + headline rules + day-blocks                                   | `tools/weather.ts`     | `GOOGLE_WEATHER_API_KEY`                                                           |
| `bus`         | Transport NSW: next departures filtered to accepted routes                                             | `tools/bus.ts`         | `TRANSPORT_NSW_API_KEY`; stops in `chota.config.ts`                                |
| `calendar`    | Google Calendar (read) via `googleapis` + better-auth Google OAuth                                     | `tools/calendar.ts`    | Google OAuth via better-auth (sign in at /admin); calendar id in `chota.config.ts` |
| `ticktick`    | TickTick lists (read + add) via official MCP at `https://mcp.ticktick.com`                             | `tools/ticktick.ts`    | `TICKTICK_API_KEY`; list-name map in `chota.config.ts`                             |
| `tmdb`        | Movie/TV search + AU watch providers (replaces JustWatch — TMDB has the JW data via partnership)       | `tools/tmdb.ts`        | `TMDB_READ_ACCESS_TOKEN`                                                           |
| `sentral`     | NSW DoE Sentral school portal — caches per-kid timetable .ics, returns today's periods                 | `tools/sentral.ts`     | `SENTRAL_BASE_URL`, `SENTRAL_<NAME>_STUDENT_ID`, `SENTRAL_<NAME>_COOKIE` per kid   |
| `apod`        | NASA Astronomy Picture of the Day — image + caption. **Built but not yet wired into a print section.** | `tools/apod.ts`        | `NASA_API_KEY` (falls back to DEMO_KEY)                                            |
| `bootprint`   | Picture-and-fact for the morning print's DID YOU KNOW section                                          | `tools/bootprint.ts`   | none                                                                               |
| `printer`     | Send composed PNG/text to MUNBYN over USB (libusb + node-thermal-printer)                              | `print/printer.ts`     | none (USB device — IDs vary; see `docs/printers.md`)                               |
| `chores`      | Daily rotation lookup (lib helper, not a REST tool)                                                    | `chores.ts`            | `chota.config.ts > chores.rotation`                                                |
| `schoolterms` | NSW public-school calendar — term/week numbers, dev days, holiday blocks (DoE page + ICS fallback)     | `tools/schoolterms.ts` | none; division in `chota.config.ts > school`                                       |
| `volleyball`  | Volleyball NSW fixtures — each kid's next game + duty roster from the division draw pages              | `tools/volleyball.ts`  | none; per-kid `volleyball` block in `chota.config.ts`                              |
| `beach`       | Randwick lifeguard surf report — summary, water temp, waves, rips, status for the configured beach     | `tools/beach.ts`       | none; `home.beach.name` in `chota.config.ts` (Randwick-council beaches)            |

### Planned (Phase 2)

| Tool     | Purpose                                                    | Source                                                                                     | Keys / config               |
| -------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------- |
| `drive`  | Family Drive folder (read)                                 | `googleapis` Node SDK                                                                      | Same Google OAuth           |
| `memory` | Read/write `data/memory/family.jsonl` (custom AI SDK tool) | `agent/memory-tool.ts`                                                                     | None                        |
| `exa`    | Web search + content extract (for agent jobs)              | `exa-js` SDK or hosted Exa MCP                                                             | `EXA_API_KEY`               |
| `energy` | Enphase solar (export, prod)                               | port of v1's Python OR Python sidecar (see `docs/audit-2026-05.md` §Ideas Worth Salvaging) | Enphase local gateway creds |

### Phase 3 (voice, chat, polish)

| Tool         | Purpose                         | Source                                                | Keys / config                  |
| ------------ | ------------------------------- | ----------------------------------------------------- | ------------------------------ |
| `transcribe` | Voice → text                    | direct Groq Whisper (cheaper/faster than via Gateway) | `GROQ_API_KEY`                 |
| `news`       | RSS digest for dashboard ticker | `rss-parser`                                          | feed list in `chota.config.ts` |

## Future ideas

### ~~JustWatch~~ — superseded by TMDB

We initially built a JustWatch wrapper using their undocumented GraphQL endpoint. Replaced by TMDB which has the same JW provider data (TMDB partnership) via a stable, documented API. JustWatch tool deleted from the repo in May 2026.

### Web search (Exa or Gateway)

Lets the future agent answer "what is X?" / "find me a recipe for Y" / "what's playing this weekend?" without us hand-rolling site scrapers.

- **Option A — Exa (`exa-js`).** Semantic search-by-meaning + content extraction. `npm install exa-js`, key from https://exa.ai. Best when we want curated answers (Exa indexes high-signal sources). Reference: https://exa.ai/docs/reference/search.
- **Option B — Vercel AI Gateway web search.** Provider-agnostic web search through the Gateway we already use. Lighter setup (one key already in `.env`), less semantic depth. Reference: https://vercel.com/docs/ai-gateway/capabilities/web-search.
- **Verdict pending.** Likely B first (no new dep, native to our routing layer), upgrade to A if quality matters for kid Q&A. Decide when we wire the agent loop.
- **Also worth a look:** https://ai-sdk.dev/docs/foundations/tools#ready-to-use-tool-packages — Vercel's catalog of pre-built agent tools (search, scraping, code-exec).

### Sandboxed shell + file IO (`@vercel/sandbox`)

For when the agent wants to write and run a quick script ("compute X from this CSV", "scrape this once").

- **Tool package:** `bash-tool` from the AI SDK ecosystem — provides `bash`, `readFile`, `writeFile` tools backed by `@vercel/sandbox` (full VM isolation).
- **Why bother:** scratches the "agent writes throwaway code" itch without giving it `Bash` against the host. Plan §"Sandboxing & blast radius" calls out that pi-coding-agent is unsandboxed today; this is a way to add a sandboxed escape hatch even if the rest of the loop is unsandboxed.
- **Cost shape:** Vercel Sandbox is a paid product (per-VM-second). Fine for occasional agent tasks; would be bad if every prompt spins one up.
- **Decide when:** the moment the agent tries to do something that wants real-time computation we don't have a tool for. Until then, custom typed tools win on latency + cost.

### Sydney-family-specific (from review with OpenCode)

These came out of a "what's missing for _this_ family" pass — keep grouped because they share the morning-routine context.

- ~~**NSW school term + public holiday feed**~~ — **shipped** as `tools/schoolterms.ts` (DoE page + ICS fallback, weekly `schoolterms-refresh` job); drives the SCHOOL header's term/week and the holiday countdown.
- **Council bin-night calendar** (City of Sydney iCal feed or per-council scrape) — "green bin tonight" is real receipt content. Belongs on the _evening_ shout, not morning.
- **After-school activity gear checklist** — translates a calendar event ("swimming 4pm") into a packing list ("goggles + towel"). Mapping lives in `chota.config.ts` (`activities: { name, gear[] }[]`); tool reads calendar and joins.
- **School canteen menu** (Flexischools-style scrape per kid's school) — kills the 8am "did you order lunch?" panic. Per-kid order links if possible.
- **Opal/school transport balance** — flags "top up needed" before it becomes a meltdown. Opal API is account-bound; per-kid card balance via family Opal portal scrape.

### Other ideas (file here as they come up)

- `recipes` — search shared family recipe doc on Drive
- `notes` — agent appends to a shared notes file
- `homework` — per-kid school portal scrape (Compass / Sentral) — rare, likely high-friction
- `screen-time` — query router / Family Link API — probably requires Google Workspace admin, defer

## API keys checklist

Order ≈ when we'll need each. Existing keys in `.env` only need rotating if they get exposed.

- [x] `TRANSPORT_NSW_API_KEY` — set
- [x] `AI_GATEWAY_API_KEY` — set
- [x] `BETTER_AUTH_SECRET` — set by `sv create`; rotate before exposing v3 login
- [x] `GOOGLE_WEATHER_API_KEY` — set
- [x] `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` — set; better-auth handles the OAuth flow now (no manual `scripts/google-auth.mjs`). Sign in at /admin
- [x] `TICKTICK_API_KEY` — set; generated at TickTick → Account → MCP. Bearer token for `https://mcp.ticktick.com`
- [x] `TMDB_READ_ACCESS_TOKEN` + `TMDB_API_KEY` — set; v4 read access token is what we use (Bearer)
- [ ] `EXA_API_KEY` — exa.ai dashboard. When agent needs web search/fetch
- [ ] **Enphase** — local gateway uses a JWT dance against Enphase Enlighten cloud. Plan flags this as the gnarliest port; might end up in a Python sidecar
- [ ] `GROQ_API_KEY` — console.groq.com → free tier covers our voice volumes. Phase 3
- [x] `TELEGRAM_BOT_TOKEN` — @BotFather. Live: boots the grammY bot at startup (see `docs/telegram.md`)

**Not needed:** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_GENAI_API_KEY` — AI Gateway proxies all of them under one key.

## Conventions

- **One file per tool:** `src/lib/server/tools/<domain>.ts`. Export a single async function (`getWeather`, `getBus`).
- **Keys via `$env/static/private`** — typed and build-time-enforced. Throw clearly on missing.
- **Config (non-secret) via `chota.config.ts`** at repo root — typed loader at `src/lib/server/config.ts`, types in `src/lib/config.ts`. Stops, routes, per-kid metadata live here.
- **Native `fetch` + `URLSearchParams` + `AbortSignal.timeout()`** — no axios/got/etc.
- **Return small flat objects**, not raw API responses. The receipt-printer doesn't care about pagination metadata.
- **Fail loud, don't mock** — if an upstream is down, throw; the route turns it into a friendly "weather unavailable" rather than printing fake data.
- **No agent dependency** — tools are runtime-agnostic. The same function powers a `+server.ts` route, a `scripts/foo.mjs` smoke test, and (later) the agent loop.

## Adding a new tool — checklist

1. Create `src/lib/server/tools/<domain>.ts` with one exported function.
2. Add any required env vars to `.env`, `.env.example`, and the keys checklist above.
3. Add per-family config to `chota.config.ts` if the data depends on family details.
4. Smoke test from a route or scratch script before wiring it deeper.
5. (For agent exposure) add a thin wrapper in `src/lib/server/agent/tools/<domain>.ts` and register it in the `tools: {}` map in `src/lib/server/agent/index.ts`.
