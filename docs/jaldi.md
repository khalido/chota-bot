# chota and jaldi

How chota (the family bot on the home Pi) and jaldi (KO's Mac launcher and agent, `~/code/jaldi`) work together. Agreed with the jaldi session on 30 Oct 2026; nothing is built. jaldi is still in heavy development, so this waits until both sides are ready.

## The shape

- **Both on Tailscale; jaldi always pulls.** jaldi's sidecar opens no port (its decisions, Sept 2026), so chota serves and jaldi polls. One bearer token (`CHOTA_TOKEN`) in chota's `.env` and in the Mac's environment; jaldi's synced config holds only the variable name.
- **Two content databases, on purpose.** chota keeps what the family forwards on WhatsApp and Telegram (`content` table, private per sender). jaldi's `content.db` keeps what KO chose to keep from X and feeds. KO's own chota saves also flow into jaldi's library; the other family members' private saves never leave the Pi.
- **jaldi doesn't copy chota's family tools,** and doesn't run its own Telegram bot (parked in jaldi's `ambient.md`, recommended left unbuilt): chota is the phone surface.

## What chota serves

1. **`GET /api/content?since=<id>`**: KO's own saves, oldest id first after `since`, with a page limit. Each row: `id` (strictly increasing; jaldi keys on it), `sender`, `scope`, `kind`, `url`, `title`, `summary`, `text` (markdown; jaldi keeps 100,000 characters), `tags`, `note`, `created_at` (ISO 8601), `file_url` for a PDF or photo (`GET /api/content/<id>/file`). A row only appears once its summary and tags are done (chota already inserts it complete). jaldi files it as `source: "chota"`, `state: library`, `placed_by: ko`, and re-judges kind and tags with its own list.
2. **An MCP endpoint (`/mcp`)** with a fixed set of chota's tools. Calls act as KO in a DM, so his private saves show. Tool names stay stable: jaldi shows them as `chota_<tool>`. jaldi approves reads (calendar, bus, saved, lists) without asking and asks KO every time for anything that leaves the house (print, post to the family, remind the kids). jaldi side: `url` servers in `mcp/servers.ts` and `connect.ts` (`@ai-sdk/mcp` already takes `transport: { type: 'http', url, headers }`).
3. **`GET /api/pings?since=<id>`**: chota's alerts and nudges as `{id, at, kind, title, body?, url?, urgency}`, ids stable so a dismissed ping stays dismissed. jaldi shows them as a HUD rail line and decides itself whether to interrupt (chota's urgency is one input). Needs a small table that every alert writes to; build it with the first proactive job.

"Print this", "send to family" and "remind the kids" from the Mac are jaldi's agent calling the MCP tools; a launcher row only if jaldi's usage log later shows KO reaching for them.

## Needs from KO before building

- Which family member in `chota.config.ts` is KO, and which admin email belongs to whom (for the token's identity and the `/saved` page).
