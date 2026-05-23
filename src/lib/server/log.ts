/**
 * Logging — LogTape, configured once at boot.
 *
 * Two sinks: a human-readable console sink (→ stdout → `journalctl` on the
 * kiosk) and a rotating JSON-lines file sink at `data/logs/chota.log` (grep /
 * `jq`-able, survives restarts). See `docs/logging.md` for the design.
 *
 * Three ways to log, in rough order of preference:
 *   - `event(category, msg, fields)` — a wide event for one unit of work.
 *     Accumulate fields, then `.done()` / `.fail(err)` at the end.
 *   - `logger(scope)` — a LogTape logger for ad-hoc structured lines.
 *   - `log(scope, ...)` / `logErr(scope, ...)` — compat shims for the old
 *     console.log wrapper. Existing callsites keep working unchanged; migrate
 *     the interesting ones to `event()` over time.
 *
 * `configureLogging()` is called from `hooks.server.ts`'s `init` hook. Until
 * then loggers resolve lazily to no-ops — so importing this module in tests
 * or scripts opens no file and prints nothing.
 */
import {
	configure,
	getConsoleSink,
	getLogger,
	jsonLinesFormatter,
	type Sink
} from '@logtape/logtape';
import { getRotatingFileSink } from '@logtape/file';
import { getOpenTelemetrySink } from '@logtape/otel';
import { mkdirSync } from 'node:fs';
import { dev, version } from '$app/environment';
import { env } from '$env/dynamic/private';

const LOG_DIR = 'data/logs';
const LOG_FILE = `${LOG_DIR}/chota.log`;

/** Base context stamped on every record — which build, dev vs prod. */
const base = { version, env: dev ? 'dev' : 'prod' };

/** Root logger; `version`/`env` propagate to every child via `.with()`. */
const root = getLogger(['chota']).with(base);

/** Resolve a `'a/b/c'` scope to a nested child logger under `['chota']`. */
function childOf(scope: string) {
	return scope.split('/').reduce((lg, seg) => lg.getChild(seg), root);
}

/**
 * A LogTape logger for a scope. `scope` maps onto a hierarchical category:
 * `logger('tool/ticktick')` → `['chota','tool','ticktick']`.
 */
export function logger(scope: string) {
	return childOf(scope);
}

// HMR / restart safe: the flag lives on globalThis so a hot-reload of this
// module doesn't call configure() twice (LogTape throws on a second call).
declare global {
	var __chotaLogConfigured: boolean | undefined;
}

/**
 * Configure LogTape's sinks. Idempotent, and wrapped in try/catch — logging
 * is a side concern, a bad sink config must never take down the app. Call
 * once at boot, after env vars are available.
 *
 * Sinks: console (always, → stdout → journalctl on the kiosk) + a rotating
 * JSON-lines file at `data/logs/chota.log` + an OTLP sink to PostHog/Axiom/etc
 * when `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT` is set. The OTel sink is best-effort
 * and batched — a dropped endpoint never blocks local logging.
 */
export async function configureLogging(): Promise<void> {
	if (globalThis.__chotaLogConfigured) return;
	globalThis.__chotaLogConfigured = true;
	try {
		// getRotatingFileSink opens the file immediately — the dir must exist.
		mkdirSync(LOG_DIR, { recursive: true });

		const sinks: Record<string, Sink> = {
			console: getConsoleSink(),
			// bufferSize 0 → unbuffered: nothing is lost on a crash / SIGTERM.
			// Kiosk volume is a handful of events a day, so sync writes are fine.
			file: getRotatingFileSink(LOG_FILE, {
				formatter: jsonLinesFormatter,
				maxSize: 8 * 1024 * 1024,
				maxFiles: 30,
				bufferSize: 0
			})
		};
		const sinkNames = ['console', 'file'];

		// OTLP export — gated on env presence so dev / CI / fresh boxes need zero
		// setup. PostHog: endpoint `https://us.i.posthog.com/i/v1/logs`, headers
		// `Authorization=Bearer phc_…`. Axiom / Honeycomb / others work the same
		// way. `diagnostics: true` surfaces export failures through the
		// `['logtape','meta']` logger — otherwise a 401/404 would be silent.
		const otlpEndpoint = env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
		if (otlpEndpoint) {
			sinks.otel = getOpenTelemetrySink({
				serviceName: env.OTEL_SERVICE_NAME || 'chota-bot',
				diagnostics: true,
				otlpExporterConfig: {
					url: otlpEndpoint,
					headers: parseOtlpHeaders(env.OTEL_EXPORTER_OTLP_LOGS_HEADERS)
				}
			});
			sinkNames.push('otel');
		}

		await configure({
			sinks,
			loggers: [
				{ category: ['chota'], lowestLevel: 'info', sinks: sinkNames },
				// LogTape's own diagnostics (a failed sink, a log sent nowhere).
				// Routed to console+file only — never OTel, so a broken OTel sink
				// can't recursively try to log its own failures over itself.
				{ category: ['logtape', 'meta'], lowestLevel: 'warning', sinks: ['console', 'file'] }
			]
		});
		root.info('logging configured: {sinks}', { sinks: sinkNames.join('+'), file: LOG_FILE });
	} catch (err) {
		console.error('LogTape config failed — continuing without it.', err);
	}
}

/**
 * Parse the standard `OTEL_EXPORTER_OTLP_LOGS_HEADERS` format —
 * `key1=value1,key2=value2` — into a plain headers object. Values can contain
 * `=` (Bearer tokens), so we split only on the first `=` per pair.
 */
function parseOtlpHeaders(raw: string | undefined): Record<string, string> {
	if (!raw) return {};
	const out: Record<string, string> = {};
	for (const pair of raw.split(',')) {
		const eq = pair.indexOf('=');
		if (eq <= 0) continue;
		out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
	}
	return out;
}

/** A wide event for one unit of work — accumulate fields, end with done/fail. */
export interface Event {
	/** Add or overwrite a field. Chainable. */
	set(key: string, value: unknown): Event;
	/** Emit at `info` with `outcome: 'ok'` + `durationMs`. */
	done(extra?: Record<string, unknown>): void;
	/** Emit at `error` with `outcome: 'failed'` + `durationMs` + `error`. */
	fail(err: unknown, extra?: Record<string, unknown>): void;
}

/**
 * Start a wide event. `message` is a LogTape template — `{placeholders}` are
 * filled from the accumulated fields:
 *
 *   const ev = event('jobs', 'job {job} ran', { job: name });
 *   try { ev.set('summary', await fn()).done(); }
 *   catch (e) { ev.fail(e); }
 */
export function event(
	category: string,
	message: string,
	fields: Record<string, unknown> = {}
): Event {
	const log = childOf(category);
	const start = Date.now();
	const acc: Record<string, unknown> = { ...fields };
	const ev: Event = {
		set(key, value) {
			acc[key] = value;
			return ev;
		},
		done(extra) {
			log.info(message, { ...acc, ...extra, durationMs: Date.now() - start, outcome: 'ok' });
		},
		fail(err, extra) {
			log.error(`${message} failed`, {
				...acc,
				...extra,
				durationMs: Date.now() - start,
				outcome: 'failed',
				error: err instanceof Error ? err.message : String(err)
			});
		}
	};
	return ev;
}

/**
 * Flatten loose args (the old `log()` contract) into a LogTape message +
 * props. Errors land in `error`/`error2`/… props; braces are escaped so a
 * stray `{` in a string isn't read as a placeholder.
 */
function flatten(args: unknown[]): { msg: string; props: Record<string, unknown> } {
	const parts: string[] = [];
	const props: Record<string, unknown> = {};
	let errN = 0;
	for (const a of args) {
		if (a instanceof Error) {
			parts.push(a.message);
			props[errN === 0 ? 'error' : `error${errN + 1}`] = a.message;
			errN++;
		} else if (typeof a === 'string') {
			parts.push(a);
		} else {
			parts.push(JSON.stringify(a));
		}
	}
	const msg = parts.join(' ').replaceAll('{', '{{').replaceAll('}', '}}');
	return { msg, props };
}

/** Compat shim for the old console.log wrapper — logs at `info`. */
export function log(scope: string, ...args: unknown[]): void {
	const { msg, props } = flatten(args);
	logger(scope).info(msg, props);
}

/** Compat shim for the old console.error wrapper — logs at `error`. */
export function logErr(scope: string, ...args: unknown[]): void {
	const { msg, props } = flatten(args);
	logger(scope).error(msg, props);
}
