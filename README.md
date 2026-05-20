# Chota

*A wall kiosk + thermal printer that prints everyone in the family their own daily brief at breakfast — so nobody has to reach for a phone to find out what the day holds. ("Chota" means small; it does small things well.)*

It started with the morning scramble: everyone reaching for a screen to find out the same handful of things — what's on the calendar, the weather, when the bus goes, who's got sport. The kid with a phone checked all that *plus* their school timetable; the kid without one booted a laptop for it.

A [steady drip of thermal-printer posts on Hacker News](https://hn.algolia.com/?q=thermal+printer) nudged the rest into place: what we actually needed was one fast, physical thing that pulls it all together. So now Chota does — it gathers the day's data and prints each person their own brief.

## why a receipt printer

Fast, cheap, endless paper — and you can fold a receipt into your pocket. Mine carries a shopping list synced from our family [TickTick](https://ticktick.com/), and reaching for that beats pulling out a phone.

## what it does today

- **Two daily prints** — a morning brief at 06:45 and an evening *tomorrow* brief at 19:15, fired by a cron scheduler. Each family member gets their own sheet: weather, their school timetable, calendar, chores, the shopping list.
- **Tools wired in** — Google Weather, Transport NSW (live bus times), Google Calendar (OAuth via better-auth), TickTick, NSW DoE Sentral (school portal), TMDB, NASA APOD.
- **Live dashboard** — clock, weather (current + 48h forecast + sparklines), shopping/lists, per-person print previews, an admin/debug page, and a plain-text `/api/health` endpoint.

## stack

SvelteKit (TS, Tailwind, adapter-node) · Drizzle + better-sqlite3 · better-auth (Google OAuth) · Vitest · LogTape · node-thermal-printer + libusb · croner. The agent loop (Phase 2) will run on the Vercel AI SDK.

## under the hood

**Two print render paths:**

- **Plain text** — ESC/POS bytes, ASCII-only. The always-works fallback.
- **HTML → screenshot** — renders the kiosk's own `/print/<who>` page in a headless browser, screenshots it at the printer's 576px width, and prints that raster. More moving parts — but it means the printout is styled with ordinary CSS, so you can tweak it any which way.

**Tools are plain TS functions** — one file each, exporting a small async function. The same function powers a route, a scheduled job, the tests, and (later) a tool for the agent loop.

## status

**Phase 1 shipped** — the morning and evening prints are live, firing daily. Genuinely useful already.

Next:
- **Phase 2** — an agent loop, more tools, kiosk polish.
- **Phase 3** — voice (push-to-talk + Groq Whisper) and a Telegram chat surface.

## getting started

- **Want to run your own?** Start at [`docs/deploy.md`](docs/deploy.md).
- **Hacking on the code?** [`CLAUDE.md`](CLAUDE.md) is the project map.
- **Curious about the design?** [`docs/plan.md`](docs/plan.md) is the long-form build doc.

## security

Remote access is over [Tailscale](https://tailscale.com/); the dashboard isn't meant for the public internet. `/admin` and `/api/*` aren't auth-gated yet, so it's **local-trusted only** — keep it on your LAN / tailnet. Google Calendar access goes through better-auth's OAuth; a dashboard PIN is on the list.
