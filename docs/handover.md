# Handover — 2026-10-28

Read CLAUDE.md first, then this. The whole bot on one page: the private [Chota Bot Map](https://claude.ai/artifact/2xkHYp6pkL5yb3EVZ3fTSR); its source is `docs/chota-map.html` (to update it from a new session, publish with that artifact's `url`).

## Where things stand

- **51 local commits not pushed** (since 16 Oct). The box (`pop-os`) still runs `4eaa7f0` (checked 28 Oct); the job hardening, WhatsApp fixes and movie/book tools from 16–17 Oct are not deployed. Push and deploy when KO says.
- **Box (`pop-os`):** prints, Telegram through the channel router, alerts on failed jobs. WhatsApp is **off** there. WhatsApp runs from the Mac: `TELEGRAM_BOT_TOKEN= WHATSAPP_ENABLED=true npm run dev`.
- **Pi 5 not booted yet** (not on the tailnet 28 Oct). Needs the microSD (64 GB, A2) if KO hasn't bought it. The tailnet shows only mbp, pixel-10-pro-xl and pop-os.
- **Box Designs page** ([artifact](https://claude.ai/artifact/GhhArcB5XuyjeBEBTQW8dC), v27, source `docs/box-design/`): now has a **Wiring** tab (`wiring.mjs` data, `wiring-client.js`, `wiring-checks.mjs`, `test-wiring.mjs`): Pi 5 header and Pico 2 W pins, each part's wires (decided or proposed), checks for pin clashes and rail current, a Whole box view, build ticks in the artifact's shared db. All 80 pins checked against the official pinouts. The old standalone wiring artifact (`21sqn2M722HWJEkCMSw1Nd`) is redundant; KO hasn't said whether to delete it.
- **Photo frames** (`docs/frame.md`): KO may buy the A$75 Frameo 10.1" (Amazon AU B0F61WL5GD). Likely Android 6.0.1, so kiFOSSk (needs 7+) probably won't install; the doc has the arrival checklist (block it from the internet first, check the version over ADB).
- **Ideas pile:** `docs/inspiration.md` §Links to look through has the AI hardware directory and the Claude Duet takeaways.
- **Deps (23 Oct):** `.npmrc` has `min-release-age=2` (KO's choice; npm skips releases under 2 days old). Updated within ranges; majors held per CLAUDE.md. `googleapis` 187 is a new major, left on 186. Audit: nothing fixable without breaking majors.

## Next, in order

1. **School news watch (test on the Mac, no Pi needed).** KO forgets what's in the school portal. Per kid, once a day: read the Sentral school calendar (`calendar/getCalendar/<year>/<term>`) and newsletters (`news/getNewsletters/`) with the cookie we already keep (`tools/sentral.ts`), keep the ids already seen, and hand new or upcoming items to the agent, which decides whether to message the family ("Parent-teacher night Thursday, book here: <link>") or stay quiet. Probed 28 Oct (`tools.md` §Sentral, "Probe, 28 Oct 2026"): the calendar is the useful feed, school-wide, with times, notes and schoolbytes links; newsletters are only Sway links. Next: each kid's year group in config, dedupe by event id, lead times, then the job. One kid's cookie was failing (403); check that first. Rules from `tools.md` §Sentral beyond the timetable: GETs only, never `markNewsletterAsRead` or `markHomeworkCompleted`, check for JSON (a failure can be a 200 HTML page), school-written text and links are untrusted. Our logins are student accounts, so the parent bulletin returns 403; if KO wants more feeds, check the portal JS for read-only endpoints first, don't crawl.
2. **Pi 5 first boot** once the card is flashed (Imager: hostname `chota`, user `ko`, SSH key, Wi-Fi, `Australia/Sydney`; fit the Active Cooler; Ethernet). Then over SSH: `docs/box.md` §First boot and `docs/deploy.md` bootstrap; Chromium from apt + `AGENT_BROWSER_EXECUTABLE_PATH` (agent-browser can't install its own on arm64); `KIOSK=true`; the Pi env needs the 17 Oct keys too (`GOOGLE_BOOKS_API_KEY`, `EXA_API_KEY`, `LIBRARY_BARCODE`). Move the printer, print one by hand, watch a 06:45 run. Pair WhatsApp on the Pi (not `pop-os`), move Telegram over, update `pop-os` URLs in CLAUDE.md and the deploy docs.
3. **Screens on the Pi:** a plain monitor on micro-HDMI (needs a micro-HDMI cable) as a computer-style dashboard; a phone dashboard over `tailscale serve` (HTTPS at `chota.<tailnet>.ts.net`). First page: running and recent jobs (`job_run`), recent agent actions, anything waiting for approval.
4. **KO tries WhatsApp:** a flyer photo and a voice note by DM; untagged "we're out of milk" and an ordinary photo in the group. Check `decision` rows; tune `decisions/group-triage.json`.
5. **Printer check** (`docs/jobs.md` §Alerts → Device checks): `DLE EOT`, `printer-check` every 30 min, check before each print.
6. **Reminders and the weekly parent digest** (`docs/jobs.md` §Future); a "needs your attention" section with drafted replies fits here.
7. **Library reserve:** KO fills `LIBRARY_PIN`; read-only spike of the logged-in catalogue, then `book_reserve` behind an approval.
8. **Later:** list enrichment job; approvals + `print` tool + calendar write (`agent.md` §Channels); artifacts v0 (`docs/artifacts.md`); family memory folder; OpenCode-in-srt test (KO renews the OpenCode key: `! opencode auth`).

## Notes

- **AI calls go through Vercel AI Gateway only** (`AI_GATEWAY_API_KEY`, ids like `anthropic/…`, `google/…`); the code never used OpenRouter. KO deleted the OpenRouter key on 21 Oct and the dead line is gone from the Mac `.env`. Still to do, with KO's OK: a dedicated chota gateway key with a budget (`vercel ai-gateway api-keys`, `vercel ai-gateway budgets`), and checking the box's `.env` for an `OPENROUTER_API_KEY` line.

- **Agent shape (checked 25 Oct against the svelte skill's `agent-sidepanel.md`):** one ToolLoopAgent, 15 tools, no subagents; the only other model calls are pre-filters before the agent (Jev group triage, the Flash Lite photo gate in `channels/triage.ts`). Keep it that way: new abilities (school news, reserve) are tools on the same loop. Missing: an eval of ~10 golden questions run 2–3 times; build it before the next big prompt or tool change.
- **Sentral portal:** two GETs change state (`markNewsletterAsRead`, `markHomeworkCompleted`) — never call them.
- **WhatsApp rules:** never restart on a long `connecting`; 401 = re-pair; the WA Web version is fetched at connect. `scripts/whatsapp-spike.mjs` for one-off sends (stop the app first).
- **Artifact builder → track [vercel-labs/fx#1344](https://github.com/vercel-labs/fx/issues/1344)**: fx ignores `HTTPS_PROXY`, so it can't run inside srt.
- **Shell:** no `pgrep -fl` (prints env secrets); macOS has no `timeout`, use `perl -e 'alarm shift; exec @ARGV' 20 cmd`.
- **Private, gitignored:** `chota.config.ts`, `.env`, `data/whatsapp-auth/`, `data/files/`. `docs/page-watch.md` is a kotools draft, uncommitted on purpose.
