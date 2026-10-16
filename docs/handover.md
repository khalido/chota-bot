# Handover — 2026-10-16

Read CLAUDE.md first, then this.

## Where things stand

- **Live on the box (`pop-os`):** Phase 1 prints, the agent on `/admin/agent` and Telegram. Phase 2 (the agent driving jobs itself) not started.
- **Just shipped (two commits on 2026-10-15/16, see CHANGELOG `[Unreleased]`):**
  - deps catch-up, the stale-fire guard (`scheduler.ts`), node-ical (`ics.ts`);
  - the agent on `deepseek/deepseek-v4.1-flash-fast` with AI Gateway tools `web_search` (Exa) and `web_fetch` (Browserbase) — `@ai-sdk/google` is gone;
  - new agent tools `bus`, `chores`, `ticktick_add` (due dates for the buying list), `school_day`, `school_dates`; calendar `search` (Google's own search, a year ahead or back);
  - the house cache `withTtl` (`$lib/server/cache.ts`) on lru-cache, used by `schoolterms` and `beach`;
  - history window 50 messages; prompt rules for a fast model (bullets allowed, no false "added", counts match, no narrating tools).
- **After deploy, check:** `curl pop-os/api/health` shows the new commit; on Telegram ask "when's the next bus", "what's on the shopping list", "when's the last day of term", "what's Kid1 got today" (the box has fresh timetables; the Mac's are from May), and the morning print at 06:45.

## Next, in order

1. **Home lib weather** (`@khalido/home`, repo `khalido/home.ts`). The home session is building morning/afternoon/evening day blocks, then sends a git tag; KO publishes to npm. Wire it in beside `tools/weather.ts`, compare on real days, then switch — it fixes `?? 0` printing missing values as 0 and the hardcoded `+10:00`. `rainSoon` ("rain at pickup") needs a Google Maps Platform key. Transport later; `bus.ts` works.
2. **Code-review leftovers:**
   - Jobs that partly fail report ok: `morning-print`, `weekend-print`, `sentral-refresh` catch per-recipient errors and return "FAILED" text. Copy jaldi's `runAccounts` shape (`~/code/jaldi/jaldi-agent/src/mail/sync.ts:189`) but throw when any recipient fails.
   - One `printBrief()` for compose → print → log (2 jobs + `/api/print`). `errorMessage(err)` is in `log.ts`; older `instanceof Error ? … : String(err)` copies convert when touched.
   - Agent: return `activeTools: []` from `prepareStep` on the last allowed step so a turn never ends on a silent tool call; capped results carry true totals (everx's lessons, `agent.md` §Photos).
   - Cache: `volleyball` isn't on `withTtl` because `getNextRound(drawUrl, now)` keys on the clock — split identity from `now` first. `calendar` and `ticktick` convert when touched.
3. **Pi 5 as home server** — [`box.md`](box.md) §Phase 1: Raspberry Pi OS Lite (Trixie), hostname `chota`, **Node 26** via fnm (`@types/node` → `^26` in the same change), parallel-run then retire `pop-os`. Services: Tailscale subnet router, nightly backups, `ko` signed in as the bot's own Gmail (not a service account), uptime ping, OS `chromium` for agent-browser, srt (`npm i -g @anthropic-ai/sandbox-runtime` + `apt install bubblewrap socat`). The 64GB SanDisk Extreme PRO card is bought.
4. **WhatsApp** — [`whatsapp.md`](whatsapp.md). The bot number is active on KO's Pixel; next KO installs WhatsApp Business on it, sets the two-step PIN and turns battery optimisation off, then warms the number up for a few days. Then a `scripts/` spike on the Pi (Baileys, then baileyrs).
5. **Channels, commands, print tool, decisions** — [`agent.md`](agent.md): one slash-command registry for every channel, a `print` tool (thermal + the Brother laser) with `toolApproval`, mid-turn messages via `prepareStep`, Jev (`gateway.decisionModel('typesafe-ai/jev')`) for the group gate and print approvals.
6. **Family memory + per-person prompts** — [`memory.md`](memory.md); build after the Pi is the server. This is how chota takes over KO's yaad bot (`next.md` lists what else yaad does).
7. **Artifacts** — [`artifacts.md`](artifacts.md): phone-friendly pages built from a chat ask, an artifacts SvelteKit app on Railway built in Railway Sandboxes (or a resident builder on the Pi under srt/nono). Still design.
8. **SvelteKit 3** as its own job, once `runed` (under bits-ui) supports it.

## Notes

- **Runtime:** Node, not Bun (chota ran unchanged on Bun with no gain). The home lib is being made Node-friendly (its Hue/Enphase `fetch(…, { tls })` is Bun-only).
- **srt** (sandbox) passed all checks on the Mac; on `pop-os` bubblewrap works unprivileged but `socat` and srt aren't installed — KO runs the install (`sudo`) if we want the Linux test before the Pi.
- **`docs/page-watch.md`** is a draft from the kotools session, uncommitted on purpose; its open questions are KO's.
- **History rewrite (2026-10-15):** kids' names scrubbed from all history and force-pushed. GitHub serves the old SHAs until GitHub Support purges them (optional request; no forks).

## Open calls for KO

- Google Maps Platform key for rain-at-pickup, or skip it.
- Which Phase 2 judgment to try first.
