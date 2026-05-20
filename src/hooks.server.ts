import type { Handle, ServerInit } from '@sveltejs/kit';
import { building } from '$app/environment';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';
import { bootJobs } from '$lib/server/scheduler';
import { configureLogging } from '$lib/server/log';

// Runs once at server startup (not during build) — env vars are available.
export const init: ServerInit = async () => {
	await configureLogging();
	await bootJobs();
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
