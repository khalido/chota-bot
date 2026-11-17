# Content sync with chota

Status: **contract agreed between the jaldi and chota sessions, 2026-11-16; revised 2026-11-17 after a review against both codebases, which KO accepted (no echo, revision cursors, one key per item, X and YouTube keys, deletion cut). Not built on either side except jaldi's migration `0015`. Two points still wait on KO (end of page).** KO asked for it on 2026-11-15 ("can't jaldi run an optional content sync loop? every 5 minutes we push our changes to chota and get any new things back … when offline, check smartly"). Where the two stores stand is in [ideas.md](ideas.md) "Syncing the content store with chota". The chota repo holds the same text as `docs/content-sync.md`; change both together.

## The loop

jaldi drives it. A sidecar job, `content-sync`, runs every 5 minutes when `content.sync.url` is set, and does nothing when it is not. Each run: push what changed here since the last push chota accepted, then pull what changed there since the last pull jaldi stored. Two cursors, kept by jaldi, each moved only after its half succeeded. A run that cannot reach chota logs once at info, changes nothing and waits for the next run. Nothing queues: the cursors are the queue.

The Pi is reached on the LAN or the tailnet, never a public address. A bearer token, made on chota, kept in the Mac's Keychain, never in `settings.jsonc`. chota accepts two tokens at once, so one can be replaced without a gap. On chota the two routes are exceptions to its sign-in wall, with their own token check.

**No echo.** Applying an item that changes no synced field writes nothing: no row update, no revision bump, no cursor movement. Each side tests it: push, pull, then push again sends zero items. jaldi's `updated_at` trigger fires on any UPDATE (`0015`), so jaldi compares before it writes. jaldi pushes only items whose synced fields changed: a re-judgment or a discussion fetch moves `updated_at` but is not a push.

## Cursors

Each side pages on an integer revision, not a clock. chota adds `rev` to `content`, set to `max(rev) + 1` in the same statement as every insert or synced-field update; SQLite's single writer makes that the commit order. A Pi clock that is wrong after boot cannot hide a row. jaldi does the same for its push side: a `sync_rev` column bumped only when a synced field changes, which is also what keeps a re-judgment or a discussion fetch out of a push (`updated_at` moves on those, so it cannot be the push cursor). `updated_at` stays for display.

## What syncs

Links only, in the first slice: an item whose `source` is `link`, `feed`, `youtube` or `x` on jaldi, and `kind = link` on chota. chota's photos, voice notes and documents stay on the Pi, as do its planned shelf fields (status, rating, `ref`). Mail never syncs.

What may leave chota is KO's rule (2026-11-15), enforced on chota's server and tested there: KO's own saves and saves from the family group chat. The feed's filter is `visibleTo` for KO in a DM (`src/lib/server/tools/content.ts`), reused, not rewritten; KO's sender id comes from `chota.config.ts`. Another family member's private saves never appear in any response. Today `scopeFor` makes any non-DM chat `family`; before the routes ship, only the family group (named in config) counts as family, and a save in any other group is private to its sender.

A row's scope never changes. Making a family save private, or the reverse, is a new row.

What leaves jaldi: items in `library` and `discarded`. The `river` (unjudged feed and X items) stays on the Mac. An item jaldi pushes is KO's and private on chota; chota fills its own required `channel`, `thread_id` and `message_id` with `jaldi`, `jaldi` and `source:external_id`.

## Identity

Two items are the same when `source` and `key` match. For a link, `key` is jaldi's `linkKey` (`jaldi-agent/src/content/links.ts`): the canonical address without its scheme, without `www.`, without a trailing slash. A port that is not the scheme's default stays (`example.com:8443/a`): another port is another server. For the other sources `key` is `external_id` (a post id, a feed guid, a video id). Each side keeps its own `external_id` and integer ids; neither crosses as identity. chota ports `links.ts` with a "ported from jaldi" comment and keeps its own `cleanUrl` (which tidies links in replies) separate. chota stores the `key` jaldi sends and computes one only for its own saves, so a drift between the two ports touches new chota saves, never synced ones.

X and YouTube are the common case, not the edge (157 of jaldi's 162 items on 2026-11-17 are X posts):

- An X post link on chota (stored as `https://x.com/i/status/<id>`) goes on the wire as `source = x`, `key = <post id>`, matching jaldi's X items.
- A YouTube link goes on the wire as `source = youtube`, `key = <video id>`, whichever side saved it and whether jaldi holds it as `link` or `youtube`. jaldi maps a `link` item with a YouTube address to that key when it pushes and when it applies.
- The same holds for an X post KO saved from the launcher, which jaldi holds as `link` with the address as given (`x.com/<name>/status/<id>?s=20`): it travels as `source = x`, `key = <post id>`. A post address is any `x.com` or `twitter.com` path ending `/status/<digits>`.

Both test suites check these, computed by jaldi's code on 2026-11-16 (the two port rows 2026-11-17, when `linkKey` stopped dropping the port):

| Address | Canonical | Key |
|---|---|---|
| `https://example.com/post?utm_source=x&id=7#top` | `https://example.com/post?id=7` | `example.com/post?id=7` |
| `http://Example.COM/Post/` | `http://example.com/Post/` | `example.com/Post` |
| `https://www.example.com/a/b/?ref_src=tw` | `https://www.example.com/a/b/` | `example.com/a/b` |
| `https://example.com/a?b=2&a=1` | `https://example.com/a?b=2&a=1` | `example.com/a?b=2&a=1` |
| `https://example.com/p?fbclid=abc&gclid=def&q=tea` | `https://example.com/p?q=tea` | `example.com/p?q=tea` |
| `https://example.com` | `https://example.com/` | `example.com` |
| `https://example.com/page#section` | `https://example.com/page` | `example.com/page` |
| `https://youtu.be/dQw4w9WgXcQ?t=42` | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `youtube.com/watch?v=dQw4w9WgXcQ` |
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1` | `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `youtube.com/watch?v=dQw4w9WgXcQ` |
| `https://m.youtube.com/shorts/abcdefghijk` | `https://www.youtube.com/watch?v=abcdefghijk` | `youtube.com/watch?v=abcdefghijk` |
| `https://example.com:8443/a/` | `https://example.com:8443/a/` | `example.com:8443/a` |
| `http://example.com:80/a` | `http://example.com/a` | `example.com/a` |

The path keeps its case, query parameters keep their order, and http and https are one page. The YouTube rows show `linkKey` itself; on the wire those items travel as `source = youtube` with the video id as key, by the rule above. 

## Owner and origin (KO, 2026-11-15)

KO: "we can improve our jaldi content store to have an owner … later we have some automated things writing to content store, like a chrome bookmarks sync or even later recording every url i visit … this gives us a source of the row which will be useful for filters." Two columns on jaldi's `item`, both carried in `Item`:

- `owner`: whose it is. `ko` for everything today; `family` for a save from the family group chat. chota's own values for its members never reach jaldi, by KO's rule.
- `origin`: what wrote the row first: `launcher`, `reader` (a bookmark), `x`, `feeds`, `chota`, later `chrome-bookmarks`. It is not part of the identity: a Chrome bookmark of a page KO already saved is the same item and keeps its first origin.

The existing `source` stays what it is, the namespace of `external_id`.

On chota, `owner = ko` maps to KO's private saves (`sender` is KO, `scope = private`) and `owner = family` to `scope = family`, visible to the whole family there. jaldi pushes `owner = family` only for items whose `origin` is `chota`; anything KO saves on the Mac arrives on chota as `ko`, private, so a Mac save never becomes visible to the family by accident.

**One item per key on the wire.** jaldi holds one item per (source, key); chota may hold two (KO's private copy and a family copy of the same link). chota's feed sends one Item per (source, key): KO's private row if there is one, else the family row, with `owner` saying which. On chota the unique key is (`scope`, `sender` when private, `source`, `key`); a family save of a link already saved to the family returns the existing row instead of adding a second.

**State on family items stays on its side.** A discard on jaldi of an `owner = family` item does not archive the family's row on chota, and the family archiving it does not discard it on the Mac. State propagates only for `owner = ko`.

## Fields and who owns them

| Field | Owner | On conflict |
|---|---|---|
| `state` (library, discarded), KO's tags, `note` | KO's hand | the later edited-at time wins, per field; a missing or null edited-at loses to any time |
| `title`, `summary`, `body`, `author`, `created_at`, `url` | whoever fetched the page | kept if present; taken from the other side only when empty here |
| judgment (`kind`, tag probabilities, scores) | each side's own model | never synced |
| `kept_at` | first to save | kept if present |

Each hand-owned field has its own edited-at time, separate from `updated_at` (any write), so a refetch or a re-judgment never beats KO's edit. Only KO's hand stamps it. Clocks are the two machines' own (both NTP); a few seconds of skew is accepted. Edited-at times decide conflicts only; cursors never use them.

- **State.** On the wire it is `state` with `state_edited_at`. chota stores `archived` with `archived_edited_at` and maps: `library` is not archived, `discarded` is archived. For `owner = ko`, a discard propagates and is reversible on either side.
- **Tags.** One way in the first slice, jaldi to chota: KO's hand-set tags as one whole set with one `tags_edited_at`, stored on chota apart from its model's tags. jaldi's set replaces chota's copy. chota sends none back until it has hand-set tags of its own.
- **Bodies.** `body_format` is `markdown` (jaldi) or `text` (chota's plain page text).
- **Empty values.** chota's `title`, `summary`, `text` and `tags` columns are NOT NULL, so chota stores `''` (or an empty list) for a missing one.

## The two requests

`GET /api/hub/changes?since=<cursor>&limit=200` → `{ "items": [Item], "cursor": "<opaque>", "more": false }`. Items changed after `since`, oldest first, already filtered by KO's rule. No `since` means from the beginning. The cursor is opaque to the reader; chota builds it from `rev` and queries `rev > ?`. A page stops at `limit` items and says `more: true`. A repeated item is harmless because applying one is idempotent.

`POST /api/hub/changes` with `{ "items": [Item] }` (at most 200 items) → `{ "accepted": 200, "problems": [{ "source", "key", "problem" }] }`. chota applies each by the table above. An item it cannot take is a problem line, not a failed request. jaldi keeps problem lines and shows their count in Settings, since the cursor moves past them.

`Item`: `{ source, key, external_id, owner, origin, url, title, summary, body, body_format, author, created_at, kept_at, state, state_edited_at, tags: [string], tags_edited_at, note, note_edited_at, updated_at }`. Times are milliseconds since 1970. A missing field means "no value"; an unknown field is ignored by the reader, so either side can add one.

Errors: 401 for a bad token, 400 with a reason for a body it cannot parse, 5xx otherwise; jaldi treats anything but 200 as "not this run".

## What each side builds

**jaldi**: columns on `item` (`owner`, `origin`, `updated_at` by trigger, `state_edited_at`) and `edited_at` on KO's tags, **built 2026-11-16** (migration `0015`, additive). Still to build: `sync_rev` (under Cursors); a no-change check before applying; the X and YouTube key mapping; one `tags_edited_at` for KO's tag set; `note` and `note_edited_at` if KO says yes below; a `sync_state` row for the two cursors; the `content-sync` job; `content.sync.url` in settings and the token in the Keychain; a line in Settings saying when it last synced and how many problems it holds. Built and tested against a stand-in server.

**chota**, about a day, in this order: the nightly backup (written, parked until a bucket exists); columns `source`, `key`, `external_id`, `rev`, `archived`, `archived_edited_at`, `tags_edited_at`, `note_edited_at`, unique on (`scope`, `sender` when private, `source`, `key`), backfilling its rows; the family-group-only scope rule; canonical keys on save, with X and YouTube mapped; the two routes behind the token; the tests that another member's private save never appears and that push, pull, push sends nothing.

## Not in the first slice

Deletion (a tombstone, how long it is kept, what a push to a deleted key does), files (photos, voice, documents), chota's shelf fields, tags from chota to jaldi, discussions (`links`) on the wire, a size cap on bodies, a favourite flag, highlights, a third device, re-keying when canonicalisation changes.

## Open, for KO

1. A discard on one side discards on the other, reversibly, for KO's own items. Both sessions recommend yes; the contract assumes it.
2. Answered 2026-11-15: jaldi gains `owner`, so a family-chat save lands in the library with `owner = family`.
3. Notes: chota keeps the words sent with a save ("for the school trip"). Both sessions recommend jaldi adds a `note` column and syncs it, later edit wins. jaldi has no notes on items today, so this is a new column and, later, a place to show it.
4. Answered 2026-11-17: deletion waits for a later slice. Until then a deletion on chota stays on chota.
