# Handover

State on 2026-11-15: steps 1–4 of the brief are built and work in a browser (`/receiver?demo`), with unit tests. Moved from `~/code/cast` into chota-bot's `cast/` (KO, 15 Nov); not committed. Deployed 17 Nov to `https://cast.khalido.dev` (Worker `cast`, KO's khalido.dev Cloudflare account): `/`, `/receiver` and `/llms.txt` answer 200 over HTTPS, and the live receiver loads the SDK with no CSP refusals in desktop Chrome. App FCE23D20 is published (unlisted) with that receiver URL. Never run on a TV yet.

## Needs KO

1. **Commit and push** chota-bot's `cast/` (plus the `.gitignore`, `.prettierignore` and CLAUDE.md lines). The landing page, llms.txt and `receiver.html` link to `github.com/khalido/chota-bot/tree/main/cast`, which 404s until then.
2. **First TV run**: `home cast launch "<TV>" FCE23D20` from the Pi, then push a screen (`examples/sender.ts`). The Streamer stays registered as a test device in the Cast console, so its console opens from Chrome's `chrome://inspect` for the checks below.

Redeploy after a change: `bun run build && CLOUDFLARE_ACCOUNT_ID=<khalido.dev account> bunx wrangler deploy` from `cast/`.

## Not yet checked on a TV

- That the published https receiver launches on the Google TV Streamer at all (the unpublished http one answered `LAUNCH_ERROR NOT_FOUND`).
- The CSP against the real device. The SDK's message bus is `ws://localhost:<port from the platform>/v2/ipc` (read in `cast_receiver_framework.js`), so `connect-src` is `ws://localhost:*`, not `'none'`. In a desktop browser the SDK loads, MPL loads and the socket is attempted with no CSP violation. If the TV refuses something, its console names the directive.
- Which keys arrive. `App.svelte` closes on `BrowserBack`, `GoBack`, `Escape`, `Back` and keyCode 461; Google TV may handle Back itself and never pass it on. chota's `/tv` page logs keys to `/tv/probe` and is the way to find out.
- `addCustomMessageListener` before `start()`, with the namespace also in `customNamespaces`: what Google's sample does; the reference says it throws if the system isn't ready. If it throws on the TV, move the listener after `start()`.
- Replies: `@khalido/home`'s `send` doesn't read answers, so `ack`/`error` go nowhere for chota yet.
- Both sender samples are typechecked (TS) or compiled (Python), never run against a device.
- The TV's Chromium version. Tailwind 4's CSS needs a recent one; log `navigator.userAgent` on the first TV run.

## Next (brief step 5, not built)

Navigation: left/right switch screens (tabs are already drawn), up/down/enter move focus within a screen, and keys the receiver doesn't use go to the sender as `{ type: 'key', key, screen, item? }` with `sendCustomMessage`. List and card items already carry optional `id`s for `item`.

## Decisions

- Plain Vite + Svelte 5 multi-page, not SvelteKit: SvelteKit's inline bootstrap script fights a strict `script-src`, and its shared `app.html` makes a receiver-only comment block and CSP awkward. Two HTML files, no router.
- The CSP is added at build only (Vite's dev server needs inline scripts and its own socket). Test it with `bun run build && bun run preview`.
- Zod validates every message; the schema is the one source for the receiver, the types and the landing page's block table. It makes the receiver bundle about 130 KB (40 KB gzip); `zod/mini` would shrink it if that matters on the TV.
- Sizes are rem, and 1 rem is 1/54 of the screen height, so the same classes work on any TV. A grid cell scales its block with CSS `zoom` by the screen's rows and columns.
- Not in the brief: a faint "Updated N min ago" in the top bar when nothing has changed for 10 minutes. Drop it if it's noise.
- Burn-in: no pure white, the whole screen drifts a few pixels over 20 minutes, and the waiting clock wanders over 30.
- Revision: `>=` is accepted, so one sender can send several messages at one revision; `Date.now()` makes the newest sender win.
- The text block parses markdown into a tree rendered as elements, so sender text never becomes HTML.
