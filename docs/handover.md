# Handover — 2026-10-16 (night)

Read CLAUDE.md first, then this. The map of the whole bot: the private [Chota Bot Map](https://claude.ai/artifact/2xkHYp6pkL5yb3EVZ3fTSR) page (republish from `scratchpad/chota-map.html` or rebuild from these docs).

## Where things stand

- **Live on the box (`pop-os`):** prints, Telegram through the new channel router (`src/lib/server/channels/`), alerts to Telegram for failed jobs. WhatsApp is **off** on the box (`WHATSAPP_ENABLED` unset).
- **WhatsApp works from the Mac:** `TELEGRAM_BOT_TOKEN= WHATSAPP_ENABLED=true npm run dev` (blank Telegram token, or it fights the box's poller). The Mac's `data/whatsapp-auth/` is linked to the bot number. The family test group and DMs get real agent replies; tested 2026-10-16.
- **TickTick:** four family lists — Shopping, Family (sections _Reminders_ and _To buy at some point_), Watch, Notes. Buying deleted. The bot assigns tasks (`assigneeUsername` = the person's TickTick email from `family[].email`; default the sender) and files into sections.
- **Config:** `family[]` carries `email`, `whatsapp`, `telegram` per person (real values only in `chota.config.ts`). Partner's TickTick email and everyone's Telegram ids aren't filled yet. `channels: { default: 'telegram', fallback: 'whatsapp' }`.
- **Reviews:** Gemini (design), GPT-6 Astra via OpenCode and `/ko-review` (code) — all findings applied. Gemini 4 notes go in the Claude Doc "chota — Gemini feedback" (KO pastes).

## Next, in order

1. **WhatsApp onto the box.** Add `WHATSAPP_ENABLED=true` to the box's `.env`, deploy; the pairing code arrives as a Telegram alert; KO types it on the bot phone. Then stop the Mac dev server and unlink the Mac device in WhatsApp Business → Linked devices (two connections answer twice). Back up `data/whatsapp-auth/` on the box.
2. **Printer check** (`docs/jobs.md` §Alerts → Device checks): `DLE EOT` status, a `printer-check` job every 30 min with `{ logOk: false }`, checks before each print. Needs the box and the MUNBYN.
3. **Reminders and nudges:** dated Family items, morning/after-school heads-up, weekly "anything to close?" to parents only; kids' reminders direct (KO deciding whether TickTick's own notifications cover that).
4. **List enrichment job:** new Watch items get TMDB + an Exa 1–3 line review in the note; new _To buy_ items a short research note with 2–3 links (Exa, HN via kotools).
5. **WhatsApp next tests:** polls (approvals), message edits ("working on it" → answer), photos and voice notes (yaad's pattern, `docs/next.md`).
6. **Later:** approvals + `print` tool + calendar write (`agent.md` §Channels), Sentral term calendar and newsletters (`tools.md`), Jev for untagged group messages, family memory folder, home lib weather (waiting on npm), Pi 5.

## Notes

- **Sentral portal:** JSON endpoints are readable with the student cookie; two GETs change state (`markNewsletterAsRead`, `markHomeworkCompleted`) — never call them (`tools.md`).
- **WhatsApp rules:** never restart on a long `connecting`; 401 = re-pair; the bundled WA Web version gets 405, so the version is fetched at connect (`whatsapp.md` §Spike findings).
- **`scripts/whatsapp-spike.mjs`** still works for one-off sends (`--send <file>`), but stop the app first: one login, one connection.
- **Private files:** `chota.config.ts`, `.env`, `data/whatsapp-auth/` are gitignored; KO will decide where to back them up.
- **`docs/page-watch.md`** is a kotools draft, uncommitted on purpose.
- **TickTick tests:** delete test tasks afterwards. The laundry and bins tasks are real; keep them.
