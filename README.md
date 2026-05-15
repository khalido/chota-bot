# Chota (does small things well)

This project was triggered by a desire to reduce phone use. Every day, I would check my calendar agenda, the kid with a phone would do that AND their school agenda, the bus timings, weather, the kid without a phone would fire up a laptop to check hw and classes etc.

So it dawned on me (also inspired by [multiple hckrnews posts](https://hn.algolia.com/?q=thermal+printer)) that we all just need a manual, fast thing to look at fast which combines all the info. Which led to this project — every morning it collects data and prints out a daily brief for the family.

## why a receipt printer

Fast, cheap, endless paper. And it's easy to put in your pocket! My print has a shopping list sync'd from our family [ticktick](https://ticktick.com/webapp/) list and it's easier to just use that than pull out my phone.

## what it does today

- **Morning print** — auto-fires daily - everyone gets their own calendar, chore, school timetable, ticktick list and a kid-tuned closing line.
- **Tools wired in:** Google Weather, Transport NSW (next bus), Google Calendar (better-auth OAuth), TickTick, TMDB, NSW DoE Sentral school portal, NASA APOD.
- **Dashboard surfaces:** clock, weather (current + 48h forecast + sparklines), shopping/lists, print previews, admin/debug.
- **Scheduler:** runs jobs on a timer.
 
## stack

SvelteKit (TS, Tailwind, adapter-node) · Drizzle + better-sqlite3 · Better-auth (Google OAuth) · Vitest · Vercel AI SDK + AI Gateway · node-thermal-printer + libusb · croner.

Some notes:

**Two render paths for the print.** Plain text (ESC/POS bytes, ASCII-only, the always-works fallback) and HTML→screenshot (renders the kiosk's own `/print/<who>` page, screenshots at 576px, sends as a raster image). Html to screenshot to print is a bit complex but this means you can tweak the printout any which way using css.

**Tools are plain TS functions** in one file each, exporting a small async function. The same function powers a route, a job, tests, and (later) tools for the agent loop. 

## status

**Phase 1 shipped** — morning print is live, fires every weekday, super useful already.

Next:
- **Phase 2** — agent loop, more tools, kiosk polish.
- **Phase 3** — voice (push-to-talk + Groq Whisper), Telegram chat surface.

## getting started

- **Want to run your own?** Start at [`docs/deploy.md`](docs/deploy.md).
- **Hacking on the code?** [`CLAUDE.md`](CLAUDE.md) is the project map.
- **Curious about the design?** [`docs/plan.md`](docs/plan.md) is the long-form build doc.

## security

I am running tailscale to connect to the dashboard and expose a telegram webhook to the internet. The dashboard is running better-auth for Google calendar access and later on a PIN on first boot for the dashboard.

**Local-trusted only.** `/admin` and `/api/*` aren't auth-gated yet — don't expose this app to the public internet. Use Tailscale for remote access.
