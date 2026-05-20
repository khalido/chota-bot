# tools/

One file per external data source — `weather`, `bus`, `calendar`, `sentral`,
`ticktick`, `tmdb`, `apod`, `bootprint`. Each owns its fetch, its typed return
shape, and (where useful) a module-level cache warmed by a matching
`<tool>-refresh` job in `jobs/` — e.g. `bus.ts` holds a `Map` cache that
`bus-refresh` repopulates every 5 min and `getBus()` reads.

Tools are pure data — no print or UI formatting belongs here (that lives in
`print/`). Routes and jobs import tools directly; the agent tool registry will
live in `agent/tools.ts` once the agent lands.

`sentral-login.ts` is a helper for `sentral.ts` (the agent-browser SAML login
that refreshes an expired session cookie), not a standalone tool.
