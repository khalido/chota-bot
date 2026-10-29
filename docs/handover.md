# Handover — 2026-10-29

Read CLAUDE.md first, then this. The whole bot on one page: the private [Chota Bot Map](https://claude.ai/artifact/2xkHYp6pkL5yb3EVZ3fTSR); its source is `docs/chota-map.html` (publish with that artifact's `url` to update it).

## Where things stand

- **Pushed 29 Oct, not deployed.** The X230 (`pop-os`) still runs `4eaa7f0` (16 Oct). Everything below is on GitHub, on no box yet. Two reviews ran over it on 28 Oct (`/code-review`, then `/ko-review`); their fixes are in. 215 tests, `bun run check` clean. `bun run lint` fails only on prettier in `docs/box-design/` and `docs/frame.md`.
- **Runs on Bun now** (KO, 28 Oct): `bun.lock`, `bunfig.toml` (2-day minimum release age), `trustedDependencies`; `deploy.sh`, `bootstrap.sh` and `chota.service` use `~/.bun/bin/bun`. Tested on the X230 with no Node on PATH: install, tests, build, pages, a text and an image print over USB. A Node-less box symlinks `~/.bun/bin/node` → `bun` for agent-browser's launcher (`bootstrap.sh` does it).
- **Agent:** 20-step cap with a last step that must answer (`agent/loop.ts`); failure messages that say "ask again" or "tell a parent" (`agent/errors.ts`, checked live with a bad key); one `finalText` rule for every channel; alerts written into chat history so a reply to one has context; a prompt line against claiming abilities it lacks (probed live).
- **Saved content:** `save` and `saved` tools, `content` table. A bare link is saved with a title, summary, full text and Jev tags (`decisions/content-tags.json`); photos, voice notes and PDFs on "save this". Saved in a DM it's private to the sender; group searches never show private items. The asker comes from the router as call options, never from the model. Checked live end to end.
- **Channels:** Telegram now takes photos, voice notes and documents; WhatsApp takes documents; 20 MB cap; message-id dedupe (in memory) for redeliveries.
- **WhatsApp is off everywhere.** The Mac pairing last connected 19 Oct; WhatsApp drops linked devices left offline about 30 days, so pair on the box before mid-November or re-pair.
- **AI Gateway key** `chota-2026-10-28b` ($20/month) is in the Mac and box `.env`. KO to delete the unused `chota-2026-10-28` (`vercel ai-gateway api-keys remove sJtCkxoGFV9hR6gjbcckqwIfo7A0GYwGCYAL1mlDPrwLA5Sx`).
- **Pi 5** not booted; KO sets it up 30 Oct as the main box. **`@khalido/home` 0.1.0**: KO is publishing it; chota adopts the weather first, built alongside and compared.

## Next, in order

The X230 hand-deploy is dropped (KO, 29 Oct): the Pi 5 becomes the main box on 30 Oct and gets the new code straight away. The X230 keeps printing on `4eaa7f0` until cutover.

1. **Pi 5 up, without chat** (`docs/box.md` §First boot): Imager → Pi OS Lite 64-bit, hostname `chota`, SSH key, Ethernet. `sudo apt install git`, clone `chota-bot`, scp `.env` + `chota.config.ts` from the Mac **with `TELEGRAM_BOT_TOKEN` removed and `WHATSAPP_ENABLED` unset** (only one process may poll the bot, and the X230 still does). Add `KIOSK=true` and the 17 Oct keys (`GOOGLE_BOOKS_API_KEY`, `EXA_API_KEY`, `LIBRARY_BARCODE`). Run `deploy/bootstrap.sh`: it installs Bun, agent-browser and, on arm64, apt Chromium with `AGENT_BROWSER_EXECUTABLE_PATH`. Caddy by hand (`deploy.md` §Caddy). Prove by hand: pages load, one print sheet screenshots to PNG, one Sentral login.
2. **Cutover:** stop chota on the X230; copy its `data/` (`home.db` holds OAuth tokens, history and decisions; `sentral/`) to the Pi; `bunx drizzle-kit push --force` (adds `content`); put the Telegram token back; move the MUNBYN; restart. On the Mac, point the `chota` SSH alias at the Pi (`~/.ssh/config`, `HostName chota`) so `bun run deploy` targets it. Check: `/api/health` shows the new commit, one test print, a link sent on Telegram saves privately, the 06:45 print next morning. Leave the X230 off but intact for a week.
3. **WhatsApp on the Pi:** `WHATSAPP_ENABLED=true`, restart, pairing code arrives on Telegram, KO types it on the bot phone, unlink the Mac device, back up `data/whatsapp-auth/`. Before mid-November.
4. **A week of real use:** forward links, ask for saved things, watch `decision` rows for group triage and `agent.turn` failures (kinds now logged), and the Pi's memory and temperature. Then a second Fable/Gemini round with that evidence.
5. **School news watch:** write ~10 golden questions first (the first job where the bot speaks unprompted). The probe is in `tools.md` §Sentral ("Probe, 28 Oct 2026"): the school calendar is the useful feed. Needs each kid's year group in config, dedupe by event id, lead times. One kid's cookie returned 403; check `sentral-refresh` first.
6. **Long reads:** saves now fetch, read and keep up to 400,000 characters (KO, 29 Oct; a 60,000-character New Yorker piece saved whole in 2.3 s, paywall and all). Still proposed: reading time + 3–5 key points for pieces over ~2,000 words.
7. **Later:** reminders (two kinds, from yaad: `remind` sends text with no model; `task` is written as steps and runs as a fresh turn), read-later status, "send me that PDF", printer status check, weekly parent digest, library reserve, phone dashboard over `tailscale serve`.

## Decisions waiting on KO

- **Untagged group voice notes and photos leave the house** (transcribed; photos checked by Gemini Flash Lite). Built on purpose 16 Oct; `whatsapp.md:132,155` still say addressed-only. Keep it and tell the family, or restrict it; then fix the doc.
- Delete the redundant standalone wiring artifact (`21sqn2M722HWJEkCMSw1Nd`)?

## Parked (sensible, not urgent; from the 28 Oct reviews)

- Shared helpers: one `norm()` (tmdb, books, ticktick), `DAY_MS` in `$lib/time.ts` (6 copies), one `{ emoji, status }` record per tool (now reactions, Telegram status, admin health).
- A test-DB helper built from the schema (4 tests hand-write `CREATE TABLE`); router tests for `route`/`runTurn` and Telegram media.
- Delete half-built `library.pickup`/`system` config and unused fields (`TitleInfo.tagline/tmdbUrl/episodes`, `BookBlurb.sources`); books health check needs only `EXA_API_KEY`.
- PDF text is read in the router before queueing (capped at 20 MB); move into the turn if it ever stalls.
- Prompt caching (stable prompt blocks first); prune old tool results on idle threads; a backup job; OTel "Concurrent export limit" lines at boot under Bun.
- Don't repeat from yaad: SDK-managed sessions, plan-doc sprawl, model-backend churn.

## Notes

- **Sentral:** two GETs change state (`markNewsletterAsRead`, `markHomeworkCompleted`); never call them.
- **WhatsApp:** never restart on a long `connecting`; 401 = re-pair. `scripts/whatsapp-spike.mjs` for one-off sends (stop the app first).
- **Printing:** the receipt printer stays chota's own code; the Brother laser prints through `@khalido/home` once it has a print action.
- **Bus:** Transport NSW had an outage 28 Oct afternoon (502/504), not ours.
- **Shell:** no `pgrep -fl` (prints env secrets); macOS has no `timeout`, use `perl -e 'alarm shift; exec @ARGV' 20 cmd`. Tests with real model calls need an assertion (`expect.assertions`) or vitest marks them failed.
- **Private, gitignored:** `chota.config.ts`, `.env`, `data/whatsapp-auth/`, `data/files/`. `docs/page-watch.md` is a kotools draft, uncommitted on purpose.
- Idea pile: `docs/inspiration.md`. Photo frames: `docs/frame.md`. Box drawings and wiring: `docs/box-design/` ([artifact](https://claude.ai/artifact/GhhArcB5XuyjeBEBTQW8dC)).
