# Handover — 2026-10-15

Read CLAUDE.md first, then this.

## Where things stand

- Live on the box: Phase 1 prints, agent at `/admin/agent` + Telegram. Phase 2 (agent driving jobs itself) not started.
- **Committed ("Deps catch-up, stale-fire guard, node-ical…"), reviewed with `/ko-review`, not yet pushed or deployed:** dependency catch-up, stale-fire guard in `scheduler.ts`, node-ical behind `ics.ts`, beach-name scrub, `box.md` + `memory.md`. See CHANGELOG `[Unreleased]`. After `git push` + `npm run deploy`: `curl pop-os/api/health`, load `/` and confirm calendar events (better-auth 1.7 changed `getAccessToken`) and the kids' timetables (node-ical).

## Next, in order

1. Push + deploy.
2. **Code-review leftovers** (from a 2026-10-15 review):
   - Jobs that partly fail report ok: `morning-print`, `weekend-print`, `sentral-refresh` catch per-recipient errors and return "FAILED" text. Copy jaldi's `runAccounts` shape (`~/code/jaldi/jaldi-agent/src/mail/sync.ts:189`) but throw when _any_ recipient fails. chota's scheduler doesn't back off on a throw, so that's safe.
   - Weather prints missing values as 0 (`tools/weather.ts:124`, `?? 0`); the fallback timestamp hardcodes `+10:00` (`weather.ts:265`, wrong in AEDT) and repeats `src/lib/time.ts` helpers.
   - Dedupe: one `printBrief()` for the compose → print → log sequence (2 jobs + `/api/print`); a ~10-line `cached(ttlMs, fetch)` helper that keeps the last good value and exposes `fetchedAt` (4 tools hand-roll it; house call is no lib, see `~/code/everx/web/src/lib/server/fx.ts:71`); `errorMessage(err)` in `log.ts` (jaldi's name). Inside LogTape calls pass `{ error }` instead — LogTape formats it.
   - Tests later for `schoolterms.ts`, `bus.ts` `mapEvent`.
3. **SvelteKit 3** as its own job: `npx sv migrate sveltekit-3`, config into `vite.config.ts`, `$lib` → `#lib`, `$app/environment` → `$app/env`, box `ORIGIN` env → `paths.origin`, recheck `handleError` against the auth guard. Wait until `runed` (under bits-ui) supports Kit 3.
4. **Pi 5 as home server** — [`box.md`](box.md) §Phase 1: Raspberry Pi OS Lite (Trixie), hostname `chota`, parallel-run then retire `pop-os` (KO wipes it for Omarchy). Services: Tailscale subnet router, nightly backups, `ko` via uv + service account, uptime ping. Install the OS `chromium` for agent-browser (no arm64 Chrome for Testing). Screens + box later.
5. **Family memory** — design in [`memory.md`](memory.md): markdown home folder, local-first git on the Pi, binaries in a gitignored `files/`, path-jailed tools. Build after the Pi is the server; open questions at the end of the doc.
6. **Decision models for Phase 2.** `ai` 7.0.140 ships `experimental_decide` + `gateway.decisionModel('typesafe-ai/jev')`. Candidates: weather/surf warning on a brief, print or skip, is a Telegram ask a repeat (feeds the crystallize-patterns idea). Copy `~/code/jaldi/docs/judgments.md` and the failure lessons in `~/code/everx/web/src/lib/server/chat/jev.ts`.
7. **Home lib (`@khalido/home`, `~/code/home`).** chota would take its weather + `sunNow` (replacing `toSlices` in `tools/weather.ts` and the 06:00–18:00 guess in `+layout.svelte`) and later Transport NSW. The lib's weather already runs on Node.

## History rewrite (2026-10-15) — pushed

History was rewritten with `git filter-repo` (kids' names → Kid1/2/3, a friend's name → Sam, in files and commit messages; 88 commits, same tree otherwise) and force-pushed: GitHub `main` is now `9281bb3`. Still to do:

- Box checkout reset to the new history (done).
- GitHub still serves the old commits by SHA until GitHub Support purges them (no forks exist).
- Two stale `claude/*` cloud branches (pre-rewrite history) deleted from GitHub; their docs are in `docs/archive/`. Local branches `telegram-bot-10.1` (rewritten) aren't on GitHub.

## Open calls for KO

- Kit 3 now or wait? (Recommendation: wait.)
- Which Phase 2 judgment to try first.
