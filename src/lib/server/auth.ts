import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	emailAndPassword: { enabled: true },
	socialProviders: {
		// Google sign-in for /admin. Used for read-only access to the family
		// Google Calendar (Phase 1) and as the foundation for v3 multi-user.
		// `accessType: 'offline'` + `prompt: 'select_account consent'` ensures
		// a refresh_token is issued every time, so calendar access survives
		// re-auth. better-auth stores tokens in the `account` table; tools
		// retrieve via `auth.api.getAccessToken()` (auto-refreshes).
		google: {
			clientId: env.GOOGLE_CLIENT_ID,
			clientSecret: env.GOOGLE_CLIENT_SECRET,
			accessType: 'offline',
			prompt: 'select_account consent',
			scope: ['https://www.googleapis.com/auth/calendar.readonly']
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
