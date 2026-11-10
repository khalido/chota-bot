# tools/

One file per external data source — `weather`, `bus`, `calendar`, `sentral`,
`ticktick`, `tmdb`, `apod`, `bootprint`, `schoolterms`, `volleyball`, `beach`, `music` (the Soloist house speaker through `@khalido/home`'s spotify connector, booted from `hooks.server.ts`; it leaves alone music that is playing on another device; docs/spotify.md), `spotify-web` (our own small client for Spotify's Web API on the app's keys: catalogue search and podcast episodes; finds the URI Soloist plays), `content` (saved links/photos/voice/documents/notes: Exa, unpdf, a vision model, Jev tags, DM saves private), `x` (X posts by link and search, official XDK, paid per read),
and `books/` — a folder, since a book lookup combines several sources (Google
Books, Open Library, the City of Sydney Library catalogue, Exa) behind one
`lookupBook()` in `books/index.ts`. Each owns its fetch, its typed return
shape, and (where useful) a cache. New caches use `withTtl` from
`#lib/server/cache.ts` (lru-cache: de-duplicated fetches, last good value on
failure, `asOf`) — `schoolterms` and `beach` do. Older ones are a module-level cache warmed by a matching
`<tool>-refresh` job in `jobs/` — e.g. `bus.ts` holds a `Map` cache that
`bus-refresh` repopulates every 5 min and `getBus()` reads.

Fetch through `http.ts`: `fetchJson` / `fetchText` / `fetchOk` give every request a timeout and throw `<label> <status>: <the service's message>` on an error reply. Plain `fetch` only when the raw error reply matters (Sentral's redirect check, schoolterms' feed-status log, Spotify's 401 and 429 retries); use `responseError` there. Dates: the `#lib/time` helpers (`sydneyYMDOffset(1)` for tomorrow, `ymdDiffDays`), never `+ 86_400_000`.

Tools are pure data — no print or UI formatting belongs here (that lives in
`print/`). Routes and jobs import tools directly; the agent's registry is the
`tools: {}` map in `agent/index.ts`, fed by thin wrappers in `agent/tools/`.

`sentral-login.ts` is a helper for `sentral.ts` (the agent-browser SAML login
that refreshes an expired session cookie), not a standalone tool.
