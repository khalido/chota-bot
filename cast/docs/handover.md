# Handover

State on 2026-11-17: deployed at `https://cast.khalido.dev` (Worker `cast`, KO's khalido.dev Cloudflare account) and working on the Living Room TV (Google TV Streamer, Chrome 140, `CrKey/1.56`, `DeviceType/AndroidTV`). App FCE23D20 is published, unlisted. The first version is in chota-bot `main` (f3be434); everything since is uncommitted.

Since f3be434: replies and remote keys to the senders, remote navigation (left/right, up/down focus, Back), `banner` and `ping` messages, `theme.rotate`, the `week` block, colour and motion (weather skies, springs, entrances; `now.sky`, `fps` in `pong`), the landing page's live preview and coloured code, and `examples/listen.py`. All v1 and additive: older senders keep working.

## On the TV, 17 Nov

- Acks and errors reach a pychromecast sender (`examples/listen.py`). `ping` got a `pong` with the user agent; a banner showed over the waiting clock.
- A receiver loaded before a deploy keeps running the old code: `home cast stop "<TV>"`, then launch again. A relaunched receiver is empty until a sender sends screens again, so a sender should resend when a `pong` shows no screens.
- Colour and motion deployed (abd86a0c; sky words widened in 411c0b6e): all eight skies on one screen hold 59–60 fps (`pong.fps`), 52 during the cell entrances.
- Which remote keys reach the page: see "Not yet checked".

## Needs KO

1. **Commit and push** chota-bot's `cast/`. The landing page, llms.txt and `receiver.html` link to `github.com/khalido/chota-bot/tree/main/cast`.

Redeploy after a change: `bun run build && CLOUDFLARE_ACCOUNT_ID=<khalido.dev account> bunx wrangler deploy` from `cast/`.

## Not yet checked on a TV

- Which keys arrive from the remote, and whether Back reaches the page or Google TV handles it. Run `examples/listen.py "<TV>" 300`, press the keys, and read the `key` lines (Back closes the app if it arrives). The Streamer has no remote-debug port open (9222 refused, no adb), so `chrome://inspect` isn't an option from the Mac.
- Up/down focus and left/right screen switching, seen on the TV.
- Morning by person (KO picked mock B, deployed 8ed6a578, not relaunched): `leave` and `person` blocks, `weather.now.wear`, `weather.trace`, `theme.people`. Barlow Condensed (`font-num`) is used for big numbers and times. The demo screen `kids` is the reference layout (`columns: 4, rows: [5, 8]`). Screenshot: `docs/screens/mock-b-kids.png`.
- "Back to base screen" (18 Nov 20:55 UTC): the pong's `page` showed CAF's `touch-controls` element on top at the screen's centre, while our page drew the board underneath. The body also holds `cast-media-player` and an SDK `div`. `body > :not(#app)` is now `display: none` (7239b3ca), and the centre is our board again. Unconfirmed that this was what KO saw. If it recurs, read `page` and `lifecycle` in a pong.
- `theme.brightness` (`dim` | `normal` | `bright`, default normal): normal is a step brighter than the old palette, dim is the old palette, and bright is a step above normal. Only text shades 100–700 move. Screenshot: `docs/screens/brightness.png`.
- Keeping the TV awake (af663fdd, 18 Nov): `src/receiver/awake.ts` holds a Screen Wake Lock; the pong reports `awake: "lock held"`. A silent looping `<video>` fallback (448e0434) froze the Streamer's screen on the waiting clock while the page drew the board underneath (pong `drawn: 3`), so it's gone. Don't add a video back. Still to see: whether the lock alone stops the screensaver over a long stretch. Pongs also carry `drawn` and `errors` for checking a TV we can't inspect.
- Releasing the TV: only Back and the arrows lose their default; page `visibilitychange` to hidden or `pagehide` calls `ctx.stop()`. Unconfirmed: whether Home, an input switch, the screensaver and the Google Home stop button each end the session. The pong's `lifecycle` lists what fired (page visibility, CAF visible/standby/shutdown, UTC). If the screensaver turns out to hide the page, stopping on hidden kills the board and needs rethinking.
- `@khalido/home`'s `send` doesn't read replies, so chota gets no acks, pongs or keys until the home repo adds a reader (its cast `send` is fire-and-forget).

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
