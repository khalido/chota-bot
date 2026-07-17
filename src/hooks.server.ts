import type { Handle, ServerInit } from '@sveltejs/kit';
import { json, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { isAdminEmail } from '$lib/server/config';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { bootJobs, stopJobs } from '$lib/server/scheduler';
import { bootBot, stopBot } from '$lib/server/telegram/bot';
import { configureLogging, shutdownLogging } from '$lib/server/log';
import { runPreflight } from '$lib/server/preflight';

// Runs once at server startup (not during build) — env vars are available.
export const init: ServerInit = async () => {
	await configureLogging();
	// Preflight runs after logging is configured (so findings land in the
	// journald + file sinks) but before bootJobs (so a missing DB is named in
	// the logs before better-auth or a job throws against it). Findings are
	// logged as WARN; chota keeps running degraded.
	runPreflight();
	await bootJobs();
	// Telegram long polling boots after jobs — no-ops cleanly if no token is
	// set (dev machines without a dev token). One poller per token: see bot.ts.
	await bootBot();

	// On systemd's SIGTERM (deploy restart) drain in this order: stop the
	// cron timers (croner's intervals outlive adapter-node's server.close()
	// otherwise), stop the Telegram poller, then flush LogTape so the OTel
	// batch processor exports its queued records before the process exits. The
	// unbuffered file sink doesn't need a flush — it writes through — but the
	// OTel batch would otherwise drop on every deploy.
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, async () => {
			await stopJobs();
			await stopBot();
			await shutdownLogging();
		});
	}
};

const handleBetterAuth: Handle = async ({ event, resolve }) => {
	const session = await auth.api.getSession({ headers: event.request.headers });

	if (session) {
		event.locals.session = session.session;
		event.locals.user = session.user;
	}

	return svelteKitHandler({ event, resolve, auth, building });
};

/**
 * `/admin` and every `/api/*` route require a signed-in user whose email is
 * in `chota.config.ts > adminEmails` — EXCEPT the public list below. The box
 * is reachable by the whole LAN (Caddy on :80), so a session alone isn't
 * enough (anyone could OAuth in with a random Google account), and gating is
 * deny-by-default so a future endpoint is born protected, not silently open.
 *
 * Deliberately public:
 *   - the kiosk pages (/, /clock, /weather, /lists, /morning) — the point of
 *     a wall kiosk is that the family can see them without logging in
 *   - /print/<who> — the screenshot pipeline (snapshot.ts) hits these via
 *     localhost with no session
 *   - /api/print — the on-screen print button on /print; worst case is paper
 *   - /api/health — monitoring; /api/auth/* — better-auth's own sign-in flow
 */
const PUBLIC_API_PREFIXES = ['/api/auth', '/api/health', '/api/print'];

const handleGuard: Handle = async ({ event, resolve }) => {
	const path = event.url.pathname;
	const isApi = path === '/api' || path.startsWith('/api/');
	const isAdmin = path === '/admin' || path.startsWith('/admin/');
	const isPublic = PUBLIC_API_PREFIXES.some((p) => path === p || path.startsWith(p + '/'));
	if (!(isAdmin || (isApi && !isPublic))) return resolve(event);

	const email = event.locals.user?.email;
	if (isAdminEmail(email)) return resolve(event);

	// APIs answer with a status; page navigations bounce to the sign-in screen
	// (which also explains "signed in but not on the admin list").
	if (path.startsWith('/api/')) {
		return json({ error: email ? 'forbidden' : 'unauthenticated' }, { status: email ? 403 : 401 });
	}
	redirect(303, '/login');
};

export const handle: Handle = sequence(handleBetterAuth, handleGuard);
