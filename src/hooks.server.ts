import type { Handle, ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { bootJobs, stopJobs } from '$lib/server/scheduler';
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

	// On systemd's SIGTERM (deploy restart) drain in this order: stop the
	// cron timers (croner's intervals outlive adapter-node's server.close()
	// otherwise), then flush LogTape so the OTel batch processor exports its
	// queued records before the process exits. The unbuffered file sink
	// doesn't need a flush — it writes through — but the OTel batch would
	// otherwise drop on every deploy.
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, async () => {
			await stopJobs();
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

export const handle: Handle = handleBetterAuth;
