# Handover — 2026-11-21

KO is away a few days; nothing here needs doing before he's back. The receiver is live at `https://cast.khalido.dev` (Worker `cast`, KO's khalido.dev Cloudflare account), app FCE23D20 (published, unlisted), on the Living Room TV (Google TV Streamer, Chrome 140, `CrKey/1.56`). All of `cast/` is committed in chota-bot `main` up to 548ff69. Uncommitted: the Google TV app design docs below.

Redeploy after a change: `bun run build && CLOUDFLARE_ACCOUNT_ID=<khalido.dev account> bunx wrangler deploy` from `cast/`. A receiver loaded before a deploy keeps the old code: `home cast stop "<TV>"`, then launch again.

## Where it stands

- **Daily use:** chota launches the board at 07:00 and sends screens and theme every minute, so a relaunched receiver is blank for a minute at most. Morning (a column per kid: hours, the bus, chores, school events) until 15:00, then Today, Week, Home. `theme.brightness` follows the hour (bright 6–10, dim 21–6). At 08:30 chota closes the board if it is still showing.
- **Fixed on the TV:** the SDK's `touch-controls` overlay drawing over the board (`body > :not(#app)` hidden); the screensaver (a Screen Wake Lock; pong `awake: "lock held"`). Don't add the silent `<video>` fallback back: it froze the Streamer on the waiting clock.
- **The remote:** only Back and the arrows lose their default; leaving the page (`visibilitychange` hidden or `pagehide`) calls `ctx.stop()`, so Home or an input switch frees the TV.
- **Senders get no replies yet:** `@khalido/home`'s cast `send` is fire-and-forget, so chota never sees acks, pongs or keys. `examples/listen.py` (pychromecast) does: `uv run --with pychromecast examples/listen.py "Living Room TV" 15`.

## Not yet checked on the TV

- Whether the wake lock alone holds through a long stretch, and whether the screensaver hides the page (if it does, stopping on hidden kills the board).
- Which of Home, input switch, screensaver and the Google Home stop button each end the session. Read `lifecycle` in a pong.
- Which remote keys reach the page, and whether Back reaches it or Google TV takes it: run `listen.py "<TV>" 300` and press keys.

## Google TV app (design, not built)

Issue khalido/chota-bot#2. A Play Store app anyone can install: the same board without a sender, simple D-pad games, and a code to link it to a chota.

- `docs/tv-app.md`: Capacitor 8.6.2 (move to 9 when it ships), a third Vite entry `app.html` in `cast/`, a Cloudflare link service (Worker plus Durable Object), KO's personal Play account (12 testers for 14 days), 13 build slices with the closed test from slice 4 (Snake alone), a ranked list of 10 play-and-learn games in a 480×270 pixel look.
- `docs/how-things-work.md`: about 12 machines from the Anatomy community gallery (MIT, no network, most animate on their own), each in a sandboxed frame with its author shown. First test: the flush toilet and pop-up toaster inside the slice 1 spike.
- `docs/tv-app-mock.html`: the mock.
- **Open decisions for KO** (`tv-app.md` § Open decisions): 1 link service, 2 space and On this day, 5 kids filter, 6 Play audience, 7 TV only, 8 name, 9 gallery machines or our own.

## Decisions

- OLED briefing design (KO approved 17 Nov): pure black, hairline cells instead of grey fills, a warm dimmed grey scale (`receiver.css` overrides Tailwind's neutrals), one amber accent, Inter plus Fraunces italic for the greeting (self-hosted: the CSP blocks font CDNs), a faint time-of-day wash. Cells are placed explicitly by `layout.ts` (row and column spans, `screen.rows` weights) and zoomed by their share of the screen.
- chota's Today: 4 columns, rows [3, 2]. A third short row ([3, 2, 1]) shrank the school rows to about 18 px and cut the calendar to four events, so school and the quote share the fourth bottom cell instead.

- Plain Vite + Svelte 5 multi-page, not SvelteKit: SvelteKit's inline bootstrap script fights a strict `script-src`, and its shared `app.html` makes a receiver-only comment block and CSP awkward. Two HTML files, no router.
- The CSP is added at build only (Vite's dev server needs inline scripts and its own socket). Test it with `bun run build && bun run preview`.
- Zod validates every message; the schema is the one source for the receiver, the types and the landing page's block table. It makes the receiver bundle about 130 KB (40 KB gzip); `zod/mini` would shrink it if that matters on the TV.
- Sizes are rem, and 1 rem is 1/54 of the screen height, so the same classes work on any TV. A grid cell scales its block with CSS `zoom` by the screen's rows and columns.
- The `week` block replaced "seven calendar-day blocks": in a 4-column grid each day lost a third of its width to the time column and titles were cut. Days are columns, times sit above titles, and today is marked.
- Keys: Back closes; arrows navigate and are not sent; every other key is broadcast to all senders (`sendCustomMessage` with no sender id). Left/right switching isn't reported to senders.
- Not in the brief: a faint "Updated N min ago" in the top bar when nothing has changed for 10 minutes. Drop it if it's noise.
- Burn-in: no pure white, the whole screen drifts a few pixels over 20 minutes, and the waiting clock wanders over 30.
- Revision: `>=` is accepted, so one sender can send several messages at one revision; `Date.now()` makes the newest sender win.
- The text block parses markdown into a tree rendered as elements, so sender text never becomes HTML.
