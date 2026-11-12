# The phone app

A companion to chat: a window onto what chota holds, on each person's phone, saved to the home screen as an icon. Chat stays the way to ask for things. The phone app is for looking, tapping for detail, and small edits.

It is a different thing from the dashboard. The dashboard (`/`, `/weather`, `/lists`, `/morning`) is a wall view for the room, and `/admin` is KO's tool. The phone app is one person's view, thumb-first, with its own layout and no dashboard nav.

**Status (12 Nov 2026):** the first page exists, `/me/<who>`, showing that person's reminders, read-only. Reachable on the LAN and the tailnet. Everything below is planned.

## What it is, technically

Routes in the same SvelteKit app, under `/me`. Same tables, same deploy. Server-rendered like the rest: not a single-page app. SvelteKit's SPA mode is for apps with no server; it would mean a blank page, then the script, then the data, on every cold open, and this app has a server on the same box as its data. Navigation inside the app is already client-side after the first load.

"Add to home screen" needs a web app manifest and icons (not added yet). Pings stay on WhatsApp: a home-screen web app can't be relied on to wake a phone.

## Pages

| Page                     | Shows                                                                                                                                                        | Edits                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Today (the opening page) | The person's brief: weather line, their calendar, school day, chores, bus. The same data as the printed brief and the WhatsApp summary, with tap-for-detail. | None                                                                                             |
| Reminders                | Their reminders and everyone's, soonest first. **Built, read-only.**                                                                                         | Later: move the time, pause, remove; checked by the same code as a chat request (`userjobs.ts`). |
| Lists                    | Shopping and family lists.                                                                                                                                   | Tick off, add. Through `tools/ticktick.ts` for now.                                              |
| Saved                    | Links, photos and notes they saved.                                                                                                                          | None to start                                                                                    |
| Pages                    | Things chota made on request (`docs/artifacts.md`): a packing list, a comparison, a game.                                                                    | Per page                                                                                         |

One owning function per number or list: a phone page calls the same function the brief, the dashboard and the agent tool call. It never queries on its own.

## Feel

Big tap targets (rows at least 64 px), one column, the person's name and the date at the top. Motion with Svelte's own transitions and springs: rows that slide in, a tick that lands. No explainer text; an empty state says how to add the first one from chat.

## Who can open it

Today: anyone on the home network or the tailnet who types the address, the same as `/print/<who>`. That is why it is read-only, and why a reminder made in a direct message is visible there. Before the first edit ships, and before it is reachable from outside the house:

1. **Family sign-in:** a code sent over WhatsApp (better-auth's `phone-number` plugin), as `docs/artifacts.md` plans. `/me` then shows the signed-in person, and `/me/<who>` goes away.
2. **Reach from outside:** Tailscale Funnel or a Cloudflare Tunnel exposing only `/me`, the pages and the login. `/admin` stays on the tailnet. Not Tailscale on every phone.

## Order

1. Reminders page, read-only, on the tailnet. **Done.**
2. Today page.
3. Manifest and icons, so it installs.
4. Sign-in, then edits on reminders and lists.
5. Reach from outside the house.
