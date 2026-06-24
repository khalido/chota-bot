/**
 * Drizzle schema barrel. `auth.schema.ts` is owned by the better-auth CLI
 * (`npm run auth:schema` regenerates it) — don't hand-edit it; add new tables
 * in their own `*.schema.ts` file and re-export here. `drizzle.config.ts` and
 * the db client both point at this barrel so every table is in one schema.
 */
export * from './auth.schema';
export * from './chat.schema';
