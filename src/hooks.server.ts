import type { Handle, ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { bootJobs, stopJobs } from '$lib/server/scheduler';
import { configureLogging } from '$lib/server/log';

// Runs once at server startup (not during build) — env vars are available.
export const init: ServerInit = async () => {
	await configureLogging();
	await bootJobs();

	// Stop the cron jobs on shutdown so Node's event loop drains and the
	// process exits promptly — otherwise systemd SIGKILLs it after the stop
	// timeout (croner's timers outlive adapter-node's server.close()).
	for (const signal of ['SIGTERM', 'SIGINT'] as const) {
		process.once(signal, stopJobs);
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
