# Handover — 2026-10-16 (night)

Read CLAUDE.md first, then this. The whole bot on one page: the private [Chota Bot Map](https://claude.ai/artifact/2xkHYp6pkL5yb3EVZ3fTSR); its source is `docs/chota-map.html` (to update it from a new session, publish with that artifact's `url`).

## Where things stand

- **Box (`pop-os`, commit `4eaa7f0`+):** prints, Telegram through the channel router (`src/lib/server/channels/`), alerts on failed jobs. WhatsApp is **off** there (`WHATSAPP_ENABLED` unset).
- **WhatsApp runs from the Mac:** `TELEGRAM_BOT_TOKEN= WHATSAPP_ENABLED=true npm run dev` (blank token, or it fights the box's poller). `data/whatsapp-auth/` on the Mac is linked to the bot number. DMs and @mentions get agent replies (tested). It drops every 15–25 min on the Mac's Wi-Fi and reconnects in seconds.
- **Built, not yet tried by the family:** Jev triage of untagged WhatsApp group messages (quiet turns, reaction only, `decision` table); photos to the agent (DeepSeek reads them — checked); voice notes via `google/gemini-3.5-transcribe` (checked with a synthetic clip); a Gemini Flash Lite gate for untagged group photos.
- **TickTick:** Shopping, Family (sections _Reminders_, _To buy at some point_), Watch, Notes. The bot assigns (`family[].email` = TickTick account, default the sender) and files into sections.
- **Config:** `family[]` has `role`, `email`, `whatsapp`, `telegram`. Missing: partner's TickTick email, everyone's Telegram user ids (`/start` shows them). `channels: { default: 'telegram', fallback: 'whatsapp' }`.
- **Shipped tonight, not deployed yet:** jobs — `job_run` history table, `job-check` missed-print alerts, 10-min run timeout, channels boot first, `TZ` in `chota.service`; WhatsApp — reload-safe channels, `440` stops reconnecting, group `follow_up` triage (Jev sees the bot's lines; code also requires the bot in the last 2 lines). Watch early `follow_up` verdicts in `decision`: after a restart the seeded context leans to bot lines.
- **Movies and books (17 Oct, not deployed):** agent tools `title_info`, `watch_ideas`, `book` (replaced `tmdb`). Keys in the Mac `.env`: `GOOGLE_BOOKS_API_KEY`, `EXA_API_KEY`, `LIBRARY_BARCODE`; the Pi needs them too. `library` config: `system`, `pickup` ("Darling Square Library", the catalogue's name), `branches`.
- **Box drawings** at `docs/box-design/`, same page link; v13 (18 Oct): 356 × 239 × 165, 8" screen, one SB65 + an ND65-PR passive radiator on the left end, one eye window over the printer. v1 = printer, lid screen, speaker, face (Pi-driven); the rest is marked "later" in `parts.mjs`. Open: the printer's exact depth, right-angle plugs for it, the SB65 cut-out, TALK's body depth, finish (paint vs oil). `S` in `box.mjs` redraws the box and cut list.
- **Reviews applied:** Gemini (design; triage table in the Claude Doc "chota — Gemini feedback"), GPT-6 Astra via OpenCode, `/ko-review` on every commit.

## Next, in order

0. **Pi 5 first boot (17 Oct):** SD card flashed with Raspberry Pi Imager (pre-config: hostname `chota`, user `ko`, SSH key, Wi-Fi, `Australia/Sydney`), then `docs/box.md` §First boot. Check on the Pi: `.env` has `KIOSK=true` (else prints skip without failing), Chromium from apt + `AGENT_BROWSER_EXECUTABLE_PATH`, one print by hand. Pair WhatsApp on the Pi, not on `pop-os` (that replaces step 2's box). The new hostname means updating `pop-os` URLs in CLAUDE.md and the deploy docs.
1. **KO tries it on WhatsApp:** a flyer photo and a voice note by DM; untagged "we're out of milk" (text and voice) and an ordinary photo in the group. Check `decision` rows and tune `decisions/group-triage.json` if needed.
2. **WhatsApp onto the box:** KO runs `! ssh pop-os 'echo WHATSAPP_ENABLED=true >> ~/code/chota-bot/.env'`; deploy; the pairing code arrives on Telegram; KO types it on the bot phone; stop the Mac dev server and unlink the Mac device; back up `data/whatsapp-auth/`.
3. **Printer check** (`docs/jobs.md` §Alerts → Device checks): `DLE EOT`, `printer-check` every 30 min `{ logOk: false }`, check before each print. Needs the box + MUNBYN.
4. **Reminders and the weekly parent digest:** the user-jobs table + dispatcher (`docs/jobs.md` §Future), dated Family items, kids' reminders direct (KO deciding vs TickTick's own notifications).
5. **Library reserve:** KO fills `LIBRARY_PIN` in `.env`. Then a read-only spike of the logged-in catalogue (agent-browser: login, the title's Reserve tab, the "Collect at" dropdown, which should already default to `library.pickup`), then a `book_reserve` tool behind an approval (`agent.md` §Channels). The Reserve button is on each result; `UReserves.aspx` lists current reserves.
6. **List enrichment job:** Watch → TMDB (runtime, genre, age rating) + an Exa 1–3 line review in the note; _To buy_ → a short research note with 2–3 links.
7. **Later:** approvals (interceptor resumes the paused turn) + `print` tool + calendar write (`agent.md` §Channels); Telegram photos/voice/triage; allowlists from `family[]` roles; Sentral term calendar and newsletters (`tools.md`); family memory folder; home lib weather (waiting on npm); Pi 5.

## Notes

- **Router gaps, documented in `agent.md`:** no tests for `route()` yet; a text sent right after a voice note can be handled first (transcription runs before the queue).
- **WhatsApp rules:** never restart on a long `connecting`; 401 = re-pair; the WA Web version is fetched at connect (the bundled one gets 405).
- **Sentral portal:** two GETs change state (`markNewsletterAsRead`, `markHomeworkCompleted`) — never call them.
- **`scripts/whatsapp-spike.mjs`** works for one-off sends (`--send <file>`); stop the app first (one login, one connection).
- **Private, gitignored:** `chota.config.ts`, `.env`, `data/whatsapp-auth/`, `data/files/`; KO decides backups.
- **`docs/page-watch.md`** is a kotools draft, uncommitted on purpose. The laundry and bins TickTick tasks are real.
