# Handover — 2026-10-16 (evening)

Read CLAUDE.md first, then this.

## Where things stand

- **Live on the box (`pop-os`):** Phase 1 prints, the agent on `/admin/agent` and Telegram on `deepseek/deepseek-v4.1-flash-fast`. Phase 2 (the agent driving jobs itself) not started. CHANGELOG `[Unreleased]` has the detail.
- **Shipped today:** agent tools `bus`, `chores`, `school_day`, `school_dates`, calendar `search`, `ticktick_add` (with `due` and `note`), `ticktick_done` (tick off by title, whole-word match, never guesses); watch list from a pasted link; calendar events carry a `mapsUrl` the agent gives only when asked; Telegram drafts every 300ms without blocking the stream.
- **Just built — alerts + honest jobs** (`docs/jobs.md` §Alerts): `$lib/server/alerts.ts` + `alert` table; a failed job messages `telegram.notifyChatIds` once, repeats after 12h, "working again" on recovery, silent during `alerts.quietHours` (21:00–06:30). Print and sentral jobs now throw when anyone failed. `/admin/jobs` lists alerts and has "Send test alert".
- **After deploy, check:** press "Send test alert" on `pop-os/admin/jobs` → ⚠️ then ✅ on Telegram. Ask the bot "got the …" for a real list item. Paste a show link to see it land on Watch with a note.

## Next, in order

1. **Printer check** (`docs/jobs.md` §Alerts → Device checks): `printerStatus()` via ESC/POS `DLE EOT` on the USB IN endpoint (paper out/low, cover open, error, unplugged); `printer-check` job every 30 min with `{ logOk: false }`, alert key `printer`, `clearAlert(…, { okNeeded: 2 })`; morning/weekend prints check first. Needs testing on the box with the real MUNBYN — KO pulls the paper once.
2. **WhatsApp spike** ([`whatsapp.md`](whatsapp.md)). KO has WhatsApp Business running on the bot number and messaged his own number from it. Next: typed phone fields in `chota.config.ts` (bot number, KO's number — config only, never the repo), then a `scripts/` spike (Baileys, then baileyrs). The Jev list-intent idea for untagged group messages is in `agent.md` §Decisions.
3. **Print path + `print` tool** (`agent.md` §Channels): streamline compose → screenshot → PNG → USB into one `printBrief()` first, then the tool (thermal, later laser) with approval and a sparing-use prompt line.
4. **Home lib weather** (`@khalido/home`) once it's on npm: wire in beside `tools/weather.ts`, compare, then switch. Google Maps key for rain-at-pickup is KO's call.
5. **Leftovers:** `prepareStep` returns `activeTools: []` on the last step; `volleyball` onto `withTtl` (split identity from `now` first); older `instanceof Error` copies → `errorMessage`.
6. **Later:** calendar write (propose → "yes"/👍, needs the `calendar.events` scope), Pi 5 as home server ([`box.md`](box.md)), family memory ([`memory.md`](memory.md)), artifacts ([`artifacts.md`](artifacts.md)), SvelteKit 3.

## Notes

- **Private files:** `chota.config.ts` and `.env` are gitignored and scp'd to the box on deploy. KO will decide where to back them up.
- **Runtime:** Node, not Bun.
- **`docs/page-watch.md`** is a draft from the kotools session, uncommitted on purpose.
- **TickTick tests:** delete any test task afterwards (`node scripts/ticktick-explore.mjs call delete_task …`).
