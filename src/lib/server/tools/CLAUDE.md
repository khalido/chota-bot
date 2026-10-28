# tools/

One file per external data source — `weather`, `bus`, `calendar`, `sentral`,
`ticktick`, `tmdb`, `apod`, `bootprint`, `schoolterms`, `volleyball`, `beach`, `content` (saved links/photos/voice/documents/notes: Exa, unpdf, a vision model, Jev tags, DM saves private),
and `books/` — a folder, since a book lookup combines several sources (Google
Books, Open Library, the City of Sydney Library catalogue, Exa) behind one
`lookupBook()` in `books/index.ts`. Each owns its fetch, its typed return
shape, and (where useful) a cache. New caches use `withTtl` from
`$lib/server/cache.ts` (lru-cache: de-duplicated fetches, last good value on
failure, `asOf`) — `schoolterms` and `beach` do. Older ones are a module-level cache warmed by a matching
`<tool>-refresh` job in `jobs/` — e.g. `bus.ts` holds a `Map` cache that
`bus-refresh` repopulates every 5 min and `getBus()` reads.

Tools are pure data — no print or UI formatting belongs here (that lives in
`print/`). Routes and jobs import tools directly; the agent's registry is the
`tools: {}` map in `agent/index.ts`, fed by thin wrappers in `agent/tools/`.

`sentral-login.ts` is a helper for `sentral.ts` (the agent-browser SAML login
that refreshes an expired session cookie), not a standalone tool.
