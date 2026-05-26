/**
 * Startup-time presence check — runs once from `hooks.server.ts > init`,
 * after logging is configured but before jobs boot. Verifies the runtime
 * files + env vars chota needs to function, and logs a clear WARN for any
 * that are missing.
 *
 * **Doesn't crash on failure.** A degraded chota is more diagnosable than a
 * boot-loop — the dashboard still loads, the agent still runs (with whatever
 * keys are present), and you can see exactly what to fix from journalctl /
 * the LogTape file sink.
 *
 * What it can't catch:
 *   - `chota.config.ts` missing — `config.ts` imports it directly, so a
 *     missing file fails the build (or the dev module import) before we
 *     ever get here. Failure is loud, not silent — no preflight needed.
 *   - `.env` missing — systemd's `EnvironmentFile=` refuses to start the
 *     unit. Same: loud build/start-time failure.
 *
 * What it does catch:
 *   - `data/home.db` missing — better-auth's first query would throw
 *     mid-request with a cryptic SQLITE_ERROR. Bootstrap forgot a step.
 *   - Critical env vars unset (DATABASE_URL, BETTER_AUTH_SECRET, ORIGIN,
 *     AI_GATEWAY_API_KEY) — partial silent degradation otherwise.
 *
 * Optional env vars (TICKTICK_API_KEY, TMDB_*, OPENWEATHER, …) aren't
 * checked here — their tools already log warnings when called without
 * creds, and missing them only degrades the matching feature.
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { env } from '$env/dynamic/private';
import { log, logErr } from './log';

/** Hard-required env vars — chota will misbehave without these. */
const REQUIRED_ENV = [
	'DATABASE_URL', //         better-auth + drizzle backing store
	'BETTER_AUTH_SECRET', //   OAuth + session encryption
	'ORIGIN', //               OAuth callback redirect validation
	'AI_GATEWAY_API_KEY' //    agent runtime + LLM calls
] as const;

export interface PreflightFinding {
	kind: 'file' | 'env';
	name: string;
	hint: string;
}

/**
 * Run the preflight checks. Logs a compact summary line on success, or a
 * WARN block listing each missing item on failure. Returns the findings so
 * callers can inspect / surface in admin UI later.
 */
export function runPreflight(): PreflightFinding[] {
	const findings: PreflightFinding[] = [];

	// ── env vars ─────────────────────────────────────────────────────────
	for (const key of REQUIRED_ENV) {
		if (!env[key]) {
			findings.push({
				kind: 'env',
				name: key,
				hint: `set ${key}=… in .env`
			});
		}
	}

	// ── DB file ───────────────────────────────────────────────────────────
	// DATABASE_URL is a relative path (e.g. `data/home.db`) resolved against
	// the server's CWD — which is the chota-bot repo root (systemd's
	// WorkingDirectory=).
	const dbPath = env.DATABASE_URL;
	if (dbPath) {
		const absDb = resolve(process.cwd(), dbPath);
		if (!existsSync(absDb)) {
			findings.push({
				kind: 'file',
				name: absDb,
				hint: `bootstrap the DB: npx drizzle-kit generate && cat drizzle/*.sql | sqlite3 ${dbPath}`
			});
		}
	}

	if (findings.length === 0) {
		log('preflight', `✓ all ${REQUIRED_ENV.length} required env vars + DB present`);
		return findings;
	}

	logErr('preflight', `${findings.length} missing required item(s) — chota will be degraded:`);
	for (const f of findings) {
		logErr('preflight', `  ✗ ${f.kind}: ${f.name} — ${f.hint}`);
	}
	return findings;
}
