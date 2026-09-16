# AGENTS.md

Repo facts, conventions and the code map live in [`CLAUDE.md`](CLAUDE.md) — read it first. This file only adds what an agent running unattended in CI needs.

## In CI

The CI agent has no printer, no kiosk, no `.env` and no `chota.config.ts`. Stand up a throwaway config before the checks — they fail without it, because `src/lib/server/config.ts` imports the gitignored `chota.config.ts` directly and the SQLite path needs a real directory:

```bash
cp chota.config.example.ts chota.config.ts
cp .env.example .env # then set BETTER_AUTH_SECRET to any 32+ char string
mkdir -p data        # DATABASE_URL=data/home.db lives here
```

- **Verify with:** `npm ci && npm run check && npm test && npm run lint && npm run build`. All must pass; `check` and `test` alone won't catch a broken production build.
- **The build is the real gate.** `@better-auth/core` is pinned in `package.json > overrides` and must move in lockstep with `better-auth` — an out-of-step pin fails only at build time, with a missing-export error the typecheck can't see.
- **Holds — do not bump:** `typescript` stays on 6 (7 breaks `svelte-check`), `usb` stays on 2 (3 is untested against the printer), `better-auth` stays on the 1.6 line while `@better-auth/core` is overridden to match.
- **Never put real family names anywhere** — tests, docs, code and comments use `Kid1/Kid2/Kid3`, `Parent1/Parent2`. Real values load at runtime from the gitignored `chota.config.ts`.
- **No secrets.** `.env*` and `chota.config.ts` are gitignored; never print or commit their contents.
