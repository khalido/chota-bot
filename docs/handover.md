# Handover — 2026-10-16 (late)

Read CLAUDE.md first, then this. The whole bot on one page: the private [Chota Bot Map](https://claude.ai/artifact/2xkHYp6pkL5yb3EVZ3fTSR); its source is `docs/chota-map.html` (to update it from a new session, publish with that artifact's `url`).

## Where things stand

- **Box (`pop-os`, commit `4eaa7f0`+):** prints, Telegram through the channel router (`src/lib/server/channels/`), alerts on failed jobs. WhatsApp is **off** there (`WHATSAPP_ENABLED` unset).
- **WhatsApp runs from the Mac:** `TELEGRAM_BOT_TOKEN= WHATSAPP_ENABLED=true npm run dev` (blank token, or it fights the box's poller). `data/whatsapp-auth/` on the Mac is linked to the bot number. DMs and @mentions get agent replies (tested). It drops every 15–25 min on the Mac's Wi-Fi and reconnects in seconds.
- **Built, not yet tried by the family:** Jev triage of untagged WhatsApp group messages (quiet turns, reaction only, `decision` table); photos to the agent (DeepSeek reads them — checked); voice notes via `google/gemini-3.5-transcribe` (checked with a synthetic clip); a Gemini Flash Lite gate for untagged group photos.
- **TickTick:** Shopping, Family (sections _Reminders_, _To buy at some point_), Watch, Notes. The bot assigns (`family[].email` = TickTick account, default the sender) and files into sections.
- **Config:** `family[]` has `role`, `email`, `whatsapp`, `telegram`. Missing: partner's TickTick email, everyone's Telegram user ids (`/start` shows them). `channels: { default: 'telegram', fallback: 'whatsapp' }`.
- **Reviews applied:** Gemini (design; triage table in the Claude Doc "chota — Gemini feedback"), GPT-6 Astra via OpenCode, `/ko-review` on every commit.

## Next, in order

1. **KO tries it on WhatsApp:** a flyer photo and a voice note by DM; untagged "we're out of milk" (text and voice) and an ordinary photo in the group. Check `decision` rows and tune `decisions/group-triage.json` if needed.
2. **WhatsApp onto the box:** KO runs `! ssh pop-os 'echo WHATSAPP_ENABLED=true >> ~/code/chota-bot/.env'`; deploy; the pairing code arrives on Telegram; KO types it on the bot phone; stop the Mac dev server and unlink the Mac device; back up `data/whatsapp-auth/`.
3. **Printer check** (`docs/jobs.md` §Alerts → Device checks): `DLE EOT`, `printer-check` every 30 min `{ logOk: false }`, check before each print. Needs the box + MUNBYN.
4. **Reminders and the weekly parent digest:** the user-jobs table + dispatcher (`docs/jobs.md` §Future), dated Family items, kids' reminders direct (KO deciding vs TickTick's own notifications).
5. **List enrichment job:** Watch → TMDB (runtime, genre, age rating) + an Exa 1–3 line review in the note; _To buy_ → a short research note with 2–3 links.
6. **Later:** approvals (interceptor resumes the paused turn) + `print` tool + calendar write (`agent.md` §Channels); Telegram photos/voice/triage; allowlists from `family[]` roles; Sentral term calendar and newsletters (`tools.md`); family memory folder; home lib weather (waiting on npm); Pi 5.

## Notes

- **Router gaps, documented in `agent.md`:** no tests for `route()` yet; a text sent right after a voice note can be handled first (transcription runs before the queue).
- **WhatsApp rules:** never restart on a long `connecting`; 401 = re-pair; the WA Web version is fetched at connect (the bundled one gets 405).
- **Sentral portal:** two GETs change state (`markNewsletterAsRead`, `markHomeworkCompleted`) — never call them.
- **`scripts/whatsapp-spike.mjs`** works for one-off sends (`--send <file>`); stop the app first (one login, one connection).
- **Private, gitignored:** `chota.config.ts`, `.env`, `data/whatsapp-auth/`, `data/files/`; KO decides backups.
- **`docs/page-watch.md`** is a kotools draft, uncommitted on purpose. The laundry and bins TickTick tasks are real.
