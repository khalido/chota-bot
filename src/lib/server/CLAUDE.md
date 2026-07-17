# server/

Chota's backend — everything server-only. It lives under `$lib/server` (not
`src/server`) because SvelteKit's build _guarantees_ nothing here — API keys,
the auth secret, the DB, Sentral cookies — can be imported into client code; a
value import that leaks is a build error.

- `tools/` — one file per external data source (weather, bus, calendar, …). See `tools/CLAUDE.md`.
- `jobs/` — croner-scheduled jobs, auto-discovered, one file per job. See `jobs/CLAUDE.md`.
- `print/` — the morning/evening brief → thermal-print pipeline. See `print/CLAUDE.md`.
- `db/` — Drizzle schema + better-sqlite3 client (`data/home.db`).

Loose files: `config.ts` (loads the gitignored `chota.config.ts`), `chores.ts`,
`people.ts`, `quotes.ts`, `puzzles.ts`, `auth.ts` (better-auth), `log.ts`,
`browser-lock.ts` (the process-wide agent-browser mutex shared by the print
screenshots and the Sentral SAML login), and
`scheduler.ts` (the `defineJob` wrapper that `jobs/` self-register through).
