# Changelog

Notable changes to chota, following the [Keep a Changelog](https://keepachangelog.com/en/2.0.0/)
format — with one adaptation: chota deploys continuously to a single box, so
entries are grouped by **date**, not semver. When you ship something notable,
add it under `[Unreleased]`; on deploy, retitle that block with the date.

Categories: `Added` `Changed` `Fixed` `Security` `Removed` `Deprecated`.

## [Unreleased]

### Added

- **Job run history in the DB:** every fire goes to a `job_run` table (30 days), so `/admin/jobs` and `/api/health` keep it across deploys.
- **Missed-print alerts:** `job-check` alerts when the 06:45 or Friday 18:00 print's slot passed with no run (box off, restarting, or cut off mid-run).
- **Group follow-ups:** an untagged group message that follows up on the bot's last reply ("what else can you tell me about this book?") now gets an answer. Jev sees the bot's own lines in its context and has a `follow_up` choice, answered at 0.85.
- **Run timeout:** each job run is capped at 10 min, so a hung print fails and alerts instead of blocking the job.
- **Group triage with Jev:** an untagged WhatsApp group message gets one decision-model judgment (shopping item / family to-do / watch / done / question / none; `decisions/group-triage.json`, every verdict in a new `decision` table). A list item runs a quiet agent turn that answers with a reaction only. Untagged photos pass a cheap vision check first.
- **Photos and voice notes:** photos reach the agent as images (flyers → a dated Family reminder with the details); voice notes are transcribed by Gemini through the Gateway and handled like typed text. Files are kept under `data/files/<chat>/`.
- **Family roles:** `family[].role` (`parent` / `kid`), shown to the agent.

- **WhatsApp channel** (`channels/whatsapp.ts`, baileyrs): the same agent answers DMs and @mentions in the family group, for family members with a number in config. Replies quote the message in groups, links become footnotes, and a reaction tracks the work (🤔, then each tool's emoji). Pairing by code sent as an alert; reconnects with backoff. On where `WHATSAPP_ENABLED=true`.
- **TickTick assignees and sections:** `ticktick_add` assigns to a family member (by their TickTick email, default the sender) and files into a list section; reads show both. Every history line now names its sender.
- **Person config:** `family[]` holds `email`, `whatsapp`, `telegram` per person; `/start` shows your Telegram user id.

- **WhatsApp spike** (`scripts/whatsapp-spike.mjs`, baileyrs): links the bot number by pairing code, sends, echoes, detects group @mentions, reads contact cards. Findings in `docs/whatsapp.md` §Spike findings. Config: `family[].whatsapp` / `email`, `whatsapp.botNumber`.

- **Alerts:** `$lib/server/alerts.ts` (`raiseAlert` / `clearAlert`) with an `alert` table. A failed job messages the notify chats on Telegram once, repeats only after 12h, and sends "working again" when it recovers; silent during `alerts.quietHours`; deploys don't resend. `/admin/jobs` lists alerts and can send a test one. Frequent refreshes alert after 3 failures in a row.

- **Agent tools: `bus`, `chores`, `ticktick_add`.** Next live departures for the kids' trips; whose chore it is on a day; add an item to a family list, with a due date for the buying list ("Kid1 shoes, mid-November"). `addToList` was sending TickTick the wrong shape and had never worked — fixed. The list read now shows due dates.
- **Calendar search finds more.** Uses Google Calendar's own search (title, place and notes, so "Opera House" matches the venue), up to a year ahead or back (`past`), with several wordings at once ("dinner", "restaurant"). Events now carry an ISO date, weekday and location; results cap at 15.
- **Agent tools: `school_day`, `school_dates`.** A kid's timetable for a day (with why there's none: weekend, holidays, pupil-free), and the school calendar spelled out: term and week now, last day of term and days to go, the next holidays' first and last day, when school is back (next year's Term 1 late in the year), pupil-free days.
- **House TTL cache** (`$lib/server/cache.ts`, `withTtl` on lru-cache): school terms and the beach report use it — de-duplicated fetches, the last good value on a failed refetch, and an `asOf` on every value.
- **Longer conversation memory:** the agent now sees the last 50 messages of a chat (was 12).
- **Replies can use short bullet lists** for sets of things (lists, events, buses).
- **Dashboard: auto-refresh + idle→clock screensaver moved into the layout**, so
  every kiosk page (`/`, `/weather`, `/lists`, `/morning`) stays fresh and falls
  back to the ambient clock when idle — previously only the home page did, so a
  kiosk parked on `/weather` or `/lists` froze and never screensavered. `/morning`
  added to the nav (was URL-only), and the nav scrolls on narrow phones.
- New favicon (retired the stock Svelte logo — a little thermal-receipt mark).
- **`/api/health` now reports the running build commit** (from the build-time
  `buildCommit`, no more git shell-out) plus a **DB liveness probe**
  (`SELECT 1`). `curl pop-os/api/health?format=json | jq .version` after a
  deploy is the proof the box rebuilt + restarted on your commit; `status` goes
  `down` if the sqlite file is unreachable.
- `beach` tool — parses the Randwick City Council lifeguard feed for the
  configured beach (`home.beach.name`, Maroubra) into a surf report (summary,
  water temp, wave height, rips, bluebottles, status). Surfaced through
  **weather** (sky + sea), not as its own thing: a one-line summary sits in the
  WEATHER section of **every morning** print, the agent's weather tool returns
  the **full** report (so it can answer "how cold's the water?" / "any
  bluebottles?"), and the existing `weather-refresh` job (every 30 min) warms
  the beach cache on the same tick. No separate section or job.
- Home location coordinates set to the real suburb (was a CBD placeholder) —
  accurate weather.
- `volleyball-refresh` job (Fridays 06:30 + 17:30) — force-refreshes the
  fixture + standings caches right before the morning briefs and the
  Friday-evening weekend sheet, so Sunday's game info prints from a
  minutes-old draw.

- `volleyball` agent tool — ask Chota (Telegram or `/admin/agent`) "what's on
  the volleyball this weekend" / "does anyone have duty". Marked authoritative
  over hand-typed calendar volleyball entries (tool description + a system-
  prompt rule), so the agent doesn't answer from a stale calendar event.
- Opponent ladder position on volleyball fixtures — the print and the agent
  now show "vs BLACKTOWN (#3 of 14, 21pts)", parsed from the division's
  pointscore page (URL derived from the draw URL, cached 6h).
- Group-chat readiness: in group chats each stored user turn is prefixed with
  the sender's first name; `docs/telegram.md` gained a family-group checklist
  (negative chat ID → allowlist, keep BotFather privacy mode ON).
- Dollar cost (`cost_usd` from the AI Gateway's per-step metadata) on every
  `agent.run` wide event; swapped off v7-deprecated `totalUsage`.
- Volleyball NSW fixtures tool (`tools/volleyball.ts`) — scrapes each kid's
  division draw on volleyballnsw.com.au for the next round's game **and duty
  roster**; per-kid `volleyball: { team, division, draw }` config. Fixtures
  show on the Friday-evening family sheet (VOLLEYBALL section) and each kid's
  Friday WEEKEND section.
- `/login` page + `adminEmails` config — Google sign-in screen for the admin
  gate below.
- `CHANGELOG.md` (this file) + preflight warning when `adminEmails` is unset.

### Changed

- **Channels boot before jobs**, so a job failing at startup has an alert channel to send on. `chota.service` sets `TZ=Australia/Sydney` (a fresh Pi OS box may be on UTC); needs the usual `cp` + `daemon-reload` to take effect.

- **Channel layer** (`src/lib/server/channels/`): one router for every chat app — gate, per-thread queue, history, agent run — with Telegram as the first adapter (`telegram/bot.ts` → `channels/telegram.ts`). Chats now run in parallel; messages sent while the bot is answering become one follow-up turn. History moves to `tg:<id>` thread keys at boot. Config `channels: { default, fallback }`; alerts try the fallback when the default fails.

- **Agent model → `deepseek/deepseek-v4.1-flash-fast`** (from Gemini 3.5 Flash), with web search and page reading moved to AI Gateway's own tools: `web_search` (Exa) and `web_fetch` (Browserbase Fetch, new). Replies with a tool call went from ~6–7s to ~1.3s. `@ai-sdk/google` removed.
- **Jobs fail honestly:** `morning-print`, `weekend-print` and `sentral-refresh` try every recipient, then fail naming who didn't print (they used to report ok). Heartbeat and bus-refresh no longer log every ok run.
- **Telegram streaming:** draft updates every 300ms (was 1.2s) and no longer block reading the model's stream, so fast replies visibly stream.
- **Calendar locations have a Google Maps link** the agent gives when asked (the Calendar API doesn't return the app's place link; WhatsApp can't render short links, so it isn't shown by default).
- **`ticktick_done`:** tick items off a family list by title ("got the milk"). Matching is in code: an exact title, else a single partial match; several matches or none are reported back, never guessed.
- **Buying list retired:** bigger purchases are a section of the Family list.
- **Watch list from a link:** send a link about a show and the agent reads it and adds the show to Watch with a 1–2 line note and the link. `ticktick_add` takes a `note`; reads return notes (except the notes list's bodies).
- **Deps:** in-range catch-up (`ai` 7.0.142, `better-auth` + `auth` 1.7.10, `vitest` 5.0.5).
- **iCal parsing via node-ical.** One shared `ics.ts` wraps node-ical for
  both feeds (NSW school terms, Sentral timetables), replacing two
  hand-written parsers. Output checked identical on the real feeds; Sentral
  now handles `TZID` times instead of throwing.

- **Dependency catch-up (2026-10-15).** In-range bumps across the board (`ai`
  7.0.140, `@ai-sdk/*`, Svelte 5.57.2, Vite 8.3.4, drizzle, LogTape 2.4) plus
  majors: better-auth 1.7 (calendar's `getAccessToken` now passes the account
  row id), googleapis 186, vitest 5, better-sqlite3 13. The
  deprecated `@better-auth/cli` is replaced by `auth`, which removes the
  `@better-auth/core` override. `allowScripts` added for npm 11's install-script
  gate. SvelteKit 3 deferred.

- **Deploy preflight now runs two explicit Tailscale checks** with clear, distinct
  messages: (1) is this Mac on the tailnet (`tailscale status`) → "run tailscale
  up"; (2) is Tailscale SSH still authenticated (the faster-expiring check) →
  opens the approval page and waits a bounded 120s, then continues automatically
  or tells you to re-run. Replaces the single opaque probe that stalled this week.
- Packages: in-range bumps — SvelteKit 2.70, Svelte 5.56.7, Tailwind 4.3.3,
  `ai` 7.0.32, grammY 1.45.1, lucide 1.25.0, eslint/typescript-eslint patches.
- grammY 1.44 → 1.45 (Bot API 10.2; no code changes needed) and narrowed long
  polling to `allowed_updates: ['message', 'callback_query']`. Researched the
  1.45/10.2 surface — group-chat patterns (mention gate, ephemeral replies,
  reactions-as-status), voice pipeline, and plugins-to-skip are written up in
  `docs/telegram.md > grammY notes`.
- **Weekend family print moved to Friday 18:00** (was Sat+Sun 06:45) — one
  sheet to plan the weekend before it starts: THIS WEEKEND calendar,
  volleyball games + duties, chores, shopping, puzzle tail.
- `sentral-refresh` now refreshes kids **one at a time** with a 3s gap (was
  parallel) — concurrent SAML re-logins were clobbering the shared browser.
- Packages: AI SDK majors (`ai` 7, `@ai-sdk/svelte` 5, `@ai-sdk/google` 4 —
  no code changes needed), prettier 3.9 reformat, eslint-plugin-svelte 3.20
  rule fixes. Held back: `typescript` 7 (breaks svelte-check),
  `usb` 3 (untested against the printer).

### Fixed

- WhatsApp: a dev reload opened a second socket on the same login, and the two knocked each other off every few seconds (a reply was lost). Channels now stop before booting again, and a `440 Connection replaced` stops reconnecting and alerts instead of fighting.
- `/admin/jobs` showed RUNNING on every job (croner's `isRunning()` means scheduled; `isBusy()` means running).

- **No stale print after the box wakes up.** croner fires any overdue run the
  moment a suspended box wakes, so a laptop shut for weeks printed a morning
  brief when opened. The scheduler now skips any fire more than 10 minutes
  late and records it as `skipped` in `/admin/jobs`.

- Cache staleness guards on `weather.ts` (>3h) and `bus.ts` (>1h): if a
  refresh job has been failing for hours, a read re-fetches instead of serving
  an ancient forecast / stale bus times, degrading to "unavailable" if that
  also fails. Pure safety net — the refresh jobs keep caches far inside the
  window, so healthy operation adds zero API calls. Screenshot timeout 30→35s
  for headroom on the slow box.
- Documentation refresh: root `CLAUDE.md` (deny-by-default auth wording,
  `/login` + `telegram/` in the tree, a Gotchas block, trimmed sv-create
  boilerplate), the print/agent/server sub-`CLAUDE.md` files, and
  `docs/{weather,deploy,agent,jobs}.md` brought in line with everything
  shipped this session (beach-in-weather, Friday weekend print, `ai` v7).
- `/weather` no longer crashes the fullscreen kiosk onto SvelteKit's unstyled
  default error page when the weather cache is cold — it degrades to a styled
  "Weather unavailable" state. Added a dark-aware `+error.svelte` so any loader
  throw (or a 404) shows a proper Chota page, not the bare fallback.
- Pre-ship review pass (ko-review + multi-agent code review) fixes: weekend
  family sheet no longer falls back to Friday's events labelled TODAY when
  the weekend calendar is empty; the auth guard is deny-by-default (all
  `/api/*` gated except auth/health/print, so new endpoints are born
  protected); duty-equals-playing dedup moved into the volleyball tool (the
  agent no longer reports a phantom duty shift); `weekendDates` DST-safe on
  the October spring-forward weekend; one `isAdminEmail()` helper (redirect-
  loop-proof); volleyball fetches parallelized on the print hot path;
  volleyball times match the house compact style ("8am").

- Process-wide `withBrowser()` mutex (`$lib/server/browser-lock.ts`) shared by
  the print screenshot path and the Sentral SAML login — an on-demand Telegram
  `/print` can no longer collide with a live cookie refresh.
- `@better-auth/core` override bumped in lockstep with `better-auth` (a lagged
  pin broke the production build with a missing-export error).

### Security

- **`/admin` + the sensitive APIs are now gated** (`/api/agent`, `/api/admin`,
  `/api/sentral`, `/api/ticktick`): the `hooks.server.ts` guard requires a
  better-auth session whose email is in `chota.config.ts > adminEmails`,
  failing closed when the list is empty. Previously the agent chat endpoint —
  token spend + calendar/TickTick tool access — was open to the whole LAN.
- Email+password self-serve sign-up disabled (`disableSignUp`); Google OAuth
  is the way in. Agent chat requests capped at 100 messages.

## 2026-06 — Telegram + agent

- grammY Telegram bot: allowlisted chat, streamed agent replies (rich-message
  drafts with a thinking block), `/print [who]` with recipient keyboard, chat
  history in `chat_message`. ToolLoopAgent (Vercel AI SDK) with weather /
  calendar / ticktick / tmdb / search tools, debuggable at `/admin/agent`.
- `schoolterms` tool (NSW DoE term dates + dev days) with weekly refresh job.

## 2026-05 — Phase 1 on the X230

- SP5's LCD died; kiosk moved to a ThinkPad X230 (Pop!_OS 24.04), deploy
  pipeline unchanged. LogTape structured logging (file + journald + PostHog),
  jobs system hardening, admin sub-pages (sentral / jobs / print / logs).

## Earlier

- Phase 1: SvelteKit dashboard (clock, weather, calendar, buses, lists,
  chores), morning + evening print pipeline (BriefSheet screenshot → MUNBYN
  thermal printer, canvas fallback), croner job scheduler, Sentral timetable
  scrape with SAML self-heal, TickTick lists, Google Calendar via better-auth.
