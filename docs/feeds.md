# Feed river

**Plan, not built** (17 Nov, waiting on KO's OK). Pull a list of RSS and Atom feeds, keep 90 days of entries, and let a decision model mark the ones worth reading. Separate from saved `content`: the river is what came in, a save is what someone kept.

## Feeds

A `feeds` list in `chota.config.ts`, each `{ url, scope: 'family' | 'ko' }`. The kids' feeds go in the example config with placeholder URLs. Each run copies the list into the `feed` table, so changing a feed is an edit and a deploy. An agent tool ("add this feed") waits until the list changes often.

## Tables

`src/lib/server/db/feed.schema.ts`, added to `schema.ts`. `deploy.sh` runs `drizzle-kit push`, so there is no migration file.

- `feed`: url (unique), title, scope, etag, last_modified, fetched_at, last_error.
- `feed_entry`: feed_id, guid (unique per feed), title, link, author, published_at, seen_at, summary, body (markdown), body_source (`feed` or `page`), image_url, pick_p, pick_model, judged_at.
- Entries older than 90 days are deleted.

## Fetch: `src/lib/server/feeds.ts`, job `feed-refresh`

- Copies jaldi's `readFeed` and `entryToRow` approach on `feedsmith`'s `parseFeed`.
- Conditional GET with the stored ETag and Last-Modified; dedupe on (feed, guid).
- HTML to markdown with `turndown` (new dependency, as jaldi).
- Image from `media:thumbnail`, `media:content` or an enclosure.
- A teaser (no content and a description under 1,000 characters) gets the full page through the Exa `fetchPage` in `tools/content.ts`, exported rather than copied.
- Every two hours, with the 90-day prune in the same pass. `alertAfter: 3`.

## Pick: `src/lib/server/feed-pick.ts`

- Unjudged entries in batches of about 10, one yes/no "worth reading?" each through `decideBooleans` in `decide.ts`. State: title, summary, first three paragraphs.
- The question and threshold live in a small data file. The probability, model id and question hash are stored on the row.
- If Jev throws, the batch stays unjudged until the next run.
- Its own job after each fetch; `?all` reruns everything.

## Tests

Fixture feeds in RSS and Atom, a stubbed `fetch`: dedupe, a 304, the teaser path, the prune, the pick step with `decide` mocked.

## Open

Where the river shows (phone page, the TV, a morning line) isn't decided. The plan lives in the session "Feed river in chota: pull, keep 90 days, model picks".
