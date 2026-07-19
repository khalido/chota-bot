# Changelog

Notable changes to chota, following the [Keep a Changelog](https://keepachangelog.com/en/2.0.0/)
format — with one adaptation: chota deploys continuously to a single box, so
entries are grouped by **date**, not semver. When you ship something notable,
add it under `[Unreleased]`; on deploy, retitle that block with the date.

Categories: `Added` `Changed` `Fixed` `Security` `Removed` `Deprecated`.

## [Unreleased]

### Added

- `beach` tool — parses the Randwick City Council lifeguard feed for the
  configured beach (`home.beach.name`, Coogee) into a one-line surf report
  (summary, water temp, waves, rips, status). Always included in the agent's
  weather answer, and shown as a BEACH line on the Friday briefs + weekend
  sheet (kids play beach volleyball Fri arvo + Sun morning).
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
