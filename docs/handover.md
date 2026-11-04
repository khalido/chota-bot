# Handover — 2026-10-30

Read CLAUDE.md first, then this. The whole bot on one page: the private [Chota Bot Map](https://claude.ai/artifact/2xkHYp6pkL5yb3EVZ3fTSR); its source is `docs/chota-map.html` (publish with that artifact's `url` to update it).

## Where things stand

- **All pushed (4 Nov, `929d43d`).** Nothing is deployed: the X230 (`pop-os`) still runs `4eaa7f0` (16 Oct). 215 tests, `bun run check` clean, build boots (all 13 jobs register). `bun run lint` fails only on prettier in `docs/box-design/` and `docs/frame.md`.
- **Packages current** (4 Nov): `ai` 7.0.159, `better-auth` + `auth` 1.7.15, baileyrs 0.3.13. Majors not taken yet: googleapis 189, unpdf 2, tailwind-variants 4, `@types/node` 26. Held on purpose: TypeScript 6, `usb` 2, SvelteKit 2 (adapter-node 6 needs Kit 3).
- **Runs on Bun** (28 Oct): `deploy.sh`, `bootstrap.sh` and `chota.service` use `~/.bun/bin/bun`; tested on the X230 with no Node on PATH, prints included. `bootstrap.sh` now also installs agent-browser and, on arm64, apt Chromium with `AGENT_BROWSER_EXECUTABLE_PATH` (untested until the Pi).
- **Agent:** 20-step cap with a last step that must answer (`agent/loop.ts`); failure messages that say "ask again" or "tell a parent" (`agent/errors.ts`); one `finalText` rule for every channel; alerts written into chat history.
- **Saved content:** `save` and `saved` tools, `content` table. A bare link is saved with a title, summary, full text (up to 2,000,000 characters; the summary model reads the first 400,000) and Jev tags; photos, voice notes and PDFs on "save this". A DM save is private to its sender; group searches never show private items. A 60,000-character New Yorker piece saved whole in 2.3 s, paywall and all.
- **X links don't save yet:** Exa returns nothing for x.com. A plain fetch of the post page has the full text (checked 30 Oct; `ko fetch` reads it that way, no X key needed).
- **WhatsApp is off everywhere.** The Mac pairing last connected 19 Oct; WhatsApp drops linked devices left offline about 30 days, so pair on the Pi before mid-November or re-pair.
- **AI Gateway key** `chota-2026-10-28b` ($20/month) is in the Mac and box `.env`. KO to delete the unused `chota-2026-10-28` (`vercel ai-gateway api-keys remove sJtCkxoGFV9hR6gjbcckqwIfo7A0GYwGCYAL1mlDPrwLA5Sx`).

## Next, in order

The Pi 5 becomes the main box (KO, 30 Oct). The X230 keeps printing on `4eaa7f0` until cutover; there is no separate X230 deploy.

1. ~~Push~~ done 4 Nov. SD card flashed 4 Nov (Lite 64-bit, `chota`, user `ko`, `id_ed25519` key).
2. **Pi 5 up, without chat** (`docs/box.md` §First boot): Imager → Pi OS Lite 64-bit, hostname `chota`, SSH key, Ethernet. `sudo apt install git`, clone `chota-bot`, scp `.env` + `chota.config.ts` from the Mac **with `TELEGRAM_BOT_TOKEN` removed and `WHATSAPP_ENABLED` unset** (only one process may poll the bot, and the X230 still does). Add `KIOSK=true` and the 17 Oct keys (`GOOGLE_BOOKS_API_KEY`, `EXA_API_KEY`, `LIBRARY_BARCODE`). Run `deploy/bootstrap.sh`. Caddy by hand (`deploy.md` §Caddy). Prove by hand: pages load, one print sheet screenshots to PNG, one Sentral login.
3. **Cutover:** stop chota on the X230; copy its `data/` (`home.db` holds OAuth tokens, history and decisions; `sentral/`) to the Pi; `bunx drizzle-kit push --force` (adds `content`); put the Telegram token back; move the MUNBYN; restart. On the Mac, point the `chota` SSH alias at the Pi (`~/.ssh/config`, `HostName chota`) so `bun run deploy` targets it. Check: `/api/health` shows the new commit, one test print, a link sent on Telegram saves privately, the 06:45 print next morning. Leave the X230 off but intact for a week.
4. **WhatsApp on the Pi:** `WHATSAPP_ENABLED=true`, restart, pairing code arrives on Telegram, KO types it on the bot phone, unlink the Mac device, back up `data/whatsapp-auth/`.
5. **X links save:** in `tools/content.ts > fetchPage`, when Exa returns no text, fetch the page directly and extract the article. KO forwards X links, so do this before the week of use.
6. **A week of real use:** forward links, ask for saved things, watch `decision` rows for group triage and `agent.turn` failures, and the Pi's memory and temperature. Then a second Fable/Gemini round with that evidence.
7. **School news watch:** write ~10 golden questions first (the first job where the bot speaks unprompted). The probe is in `tools.md` §Sentral ("Probe, 28 Oct 2026"): the school calendar is the useful feed. Needs each kid's year group in config, dedupe by event id, lead times. One kid's cookie returned 403; check `sentral-refresh` first.

## Later (written down, not started)

- **jaldi interop** (`docs/jaldi.md`, agreed with the jaldi session 30 Oct; jaldi is still in heavy development): chota serves KO's saves, an MCP endpoint and pings over Tailscale; jaldi pulls. Before building: which config person is KO, and which admin email is whose.
- **A `/saved` page** to browse saved items (list, search, tags; open one for the summary, full text and file). Same identity question.
- **Proactivity** (`inspiration.md` §Links: Spyglass, Spawn, Grok bot): deadline nudges from saved items, "tell me when…" watches, the bot filing its own bugs, a daily "what broke", a Gateway spend watch, one Jev question per candidate ping (now, next brief, or drop) with a daily cap. KO to think about it.
- **Calls** (`inspiration.md` §Calls): a parent rings chota, or chota rings a parent for something urgent; needs its own voice API.
- **Diagrams** with Pele (`inspiration.md` §Links): a tool that sends a Mermaid picture in chat; Mermaid in the admin agent panel too.
- **Long reads:** reading time + 3–5 key points for pieces over ~2,000 words.
- Reminders (two kinds, from yaad: `remind` sends text with no model; `task` runs as a fresh turn), "send me that PDF", printer status check, weekly parent digest, library reserve, `@khalido/home` weather built alongside and compared.

## Decisions waiting on KO

- **Untagged group voice notes and photos leave the house** (transcribed; photos checked by Gemini Flash Lite). Built on purpose 16 Oct; `whatsapp.md:132,155` still say addressed-only. Keep it and tell the family, or restrict it; then fix the doc.
- Delete the redundant standalone wiring artifact (`21sqn2M722HWJEkCMSw1Nd`)?

## Parked (sensible, not urgent; from the 28 Oct reviews)

- Shared helpers: one `norm()` (tmdb, books, ticktick), `DAY_MS` in `$lib/time.ts` (6 copies), one `{ emoji, status }` record per tool.
- A test-DB helper built from the schema (4 tests hand-write `CREATE TABLE`); router tests for `route`/`runTurn` and Telegram media.
- Delete half-built `library.pickup`/`system` config and unused fields (`TitleInfo.tagline/tmdbUrl/episodes`, `BookBlurb.sources`).
- PDF text is read in the router before queueing (capped at 20 MB); move into the turn if it ever stalls.
- Prompt caching; prune old tool results on idle threads; a backup job; OTel "Concurrent export limit" lines at boot under Bun.

## Notes

- **kotools vs our own code:** chota's own libs for anything daily or touching family data; `@khalido/home` for house devices (the Brother laser once it has a print action); `ko` commands wrapped as typed tools only for rare, hard jobs (`ko fetch` as a last resort, `ko gsheets/gdocs/drive`), never a shell.
- **Sentral:** two GETs change state (`markNewsletterAsRead`, `markHomeworkCompleted`); never call them.
- **WhatsApp:** never restart on a long `connecting`; 401 = re-pair. `scripts/whatsapp-spike.mjs` for one-off sends (stop the app first).
- **Shell:** no `pgrep -fl` (prints env secrets); macOS has no `timeout`, use `perl -e 'alarm shift; exec @ARGV' 20 cmd`. Tests with real model calls need an assertion (`expect.assertions`) or vitest marks them failed. Booting the build on the Mac: `TELEGRAM_BOT_TOKEN= WHATSAPP_ENABLED= PORT=8123 bun build/index.js` (the X230 owns the bot).
- **Private, gitignored:** `chota.config.ts`, `.env`, `data/whatsapp-auth/`, `data/files/`. `docs/page-watch.md` is a kotools draft, uncommitted on purpose.
- Idea pile: `docs/inspiration.md`. Photo frames: `docs/frame.md`. Box drawings and wiring: `docs/box-design/` ([artifact](https://claude.ai/artifact/GhhArcB5XuyjeBEBTQW8dC)).
