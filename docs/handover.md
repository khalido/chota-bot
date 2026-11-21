# Handover — 2026-11-21

Read CLAUDE.md first, then this. KO is overseas for a few days. The bot runs on its own; nothing here needs doing before he's back. The whole system on one page: the private [Chota Map](https://claude.ai/artifact/R5JqZk2uNuN1B1yT998QqP) (source `docs/chota-overview.html`, never committed).

## The box, 21 Nov

- **Pi 5 `chota` runs `548ff69`**, up 3 days, `db: ok`. `curl chota/api/health?format=json` shows the commit and every job's last run.
- **Prints:** the 06:45 weekday briefs printed all three on each day checked. The Friday 18:00 weekend sheet is unchanged.
- **TV:** `tv-morning` launches the board on the Living Room TV at 07:00 and refreshes it every minute (`tv-refresh`). It leaves a TV that's playing something else alone (one morning it skipped for Spotify). Morning screen until 15:00, then Today. Brightness follows the hour. Design and protocol: `cast/README.md`, `cast/docs/handover.md`.
- **Sentral school calendar:** `data/sentral/calendar.json` holds 41 events, refreshed with the timetable at 17:30. Each kid's column shows events naming their year, three weeks ahead. Events naming no year are left out until KO picks which kinds to add.
- **WhatsApp:** connected on the box, reconnects itself after drops. KO is testing the bot over WhatsApp while away. Worth trying: "remind me in 3 minutes to test", then "what reminders do I have", then `http://chota/me/<name>` on the phone (LAN or tailnet only).
- **Last 3 days:** one failed run each of `bus-refresh`, `ticktick-refresh`, `weather-refresh`; each recovered on its next run.

## Shipped 21 Nov

Package updates (`ai` 7.0.179, `better-auth` + `auth` 1.7.27, googleapis 190, Kit 3.4, Svelte 5.59, minor bumps) and `jobs/tv-morning-off.ts` (closes the board at 08:30 if it's still showing; leaves other apps alone) are committed and deployed. The Google TV app design docs are committed too.

**Still uncommitted:** `backup.ts`, `jobs/db-backup.ts`, `src/env.ts` (`BACKUP_S3_*`): a nightly `home.db` copy to R2, kept 30 days, parked until KO makes the bucket. `docs/chota-overview.html` and `docs/page-watch.md` are never committed.

**Package holds:** TypeScript 6 (7 breaks svelte-check), `usb` 2, vitest **5.1.0** (5.1.1's fork workers fail under Bun: `child.channel?.unref is not a function`), prettier-plugin-svelte **4.1.1** (4.2 adds spaces inside inline `<span>` text, which shows as gaps in the clock quote). Re-try both on the next update.

## Waiting on KO

1. **TV app decisions** in `cast/docs/tv-app.md` § Open decisions: 1 link service, 2 space and On this day, 5 kids filter, 6 Play audience, 7 TV only, 8 name, 9 gallery machines or our own. Build order is 13 slices; the closed test starts at slice 4 (Snake alone).
2. **Feed river plan** (`docs/feeds.md`): OK to build.
3. **Backup bucket** on R2 (KO's Cloudflare), then the four `BACKUP_S3_*` lines in the Pi's `.env`.
4. **`music` block** in `chota.config.ts` (KO's file) so chat can control the speaker. `/api/health` shows `music: null` until then.
5. **Sentral events naming no year:** which kinds go on the TV.

## Next, in order

1. KO's WhatsApp test: fix what it turns up.
2. Agent checks (from the Claude agents article, 18 Nov): about 10 example asks run against the real model, then merge tools by intent (the three TickTick tools into `lists`, the three music tools into `music`, the two school tools into `school`) and trim `agent/prompts.ts`. Check every later change against the asks.
3. `@khalido/home` cast `send` reading replies, so chota hears acks, pongs and remote keys.
4. TV board ideas not built: status pills on Home, sunrise and sunset, a 7-day forecast.
5. Issues: voice morning briefing (khalido/chota-bot#1, about 2–3¢ each), Google TV app (khalido/chota-bot#2).

## Still open from earlier (not lost, not urgent)

- From the 10 Nov review (`docs/private/review-2026-11-10.html`, gitignored): a cooldown on public `POST /api/print`; `TimeoutStopSec` in `chota.service`; one result shape for every tool; quiet and addressed turns can run at once on one group session; saved photos and voice notes aren't deduplicated on retry.
- Never checked live: a printer-check alert reaching a phone (open the cover across a tick); the Telegram allowlist from an unknown account.
- Designed, not built: an https tailnet address (KO's steps in `docs/deploy.md`); Spotify sign-in from a phone; a shelf per person on the `content` table; content sync with jaldi (`docs/jaldi.md`); Cast announcements (home 0.2.2 plays chota's WAV on every speaker); A4 two-sided briefs (`print-brief` skill, CUPS `brother` queue on the Pi); wall board hardware (not ordered).
- Alerts go to `alerts.channel`, else `channels.default`; KO's config says Telegram first, WhatsApp fallback. KO said WhatsApp should be the default; that line is his to change.

## Keep it safe

- `ssh chota` for reads only. Every write on the Pi needs KO's OK at the time, never while he is listening. Any sound or print needs his OK.
- Only one process polls Telegram. On the Mac, boot a build with `TELEGRAM_BOT_TOKEN= WHATSAPP_ENABLED= PORT=8123 bun build/index.js`.
- Never print `.env` or use `pgrep -fl`. Sentral: GETs only; never `markNewsletterAsRead` or `markHomeworkCompleted`.
- Real names, school and campus names stay in `chota.config.ts`: the repo is public. Add files by name, never `git add -A`.
- Copy the live database with `sqlite3 .backup`, not `cp` (WAL is on).
