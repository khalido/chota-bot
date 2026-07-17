import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { db } from '$lib/server/db';
import { event, logger } from '$lib/server/log';

const authLog = logger('auth');

export const auth = betterAuth({
	baseURL: env.ORIGIN,
	secret: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, { provider: 'sqlite' }),
	// Password sign-IN stays for any existing local account, but self-serve
	// sign-UP is off — the box is LAN-reachable, and admin access is gated on
	// the `adminEmails` allowlist anyway (see hooks.server.ts). Google OAuth
	// is the intended way in.
	emailAndPassword: { enabled: true, disableSignUp: true },
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
	// Route better-auth's own logs through LogTape — warnings + errors
	// (including failed sign-ins) land in console + file + PostHog.
	logger: {
		level: 'info',
		log: (level, message, ...args) => {
			const props = args.length > 0 ? { args } : {};
			if (level === 'error') authLog.error(message, props);
			else if (level === 'warn') authLog.warn(message, props);
			else if (level === 'debug') authLog.debug(message, props);
			else authLog.info(message, props);
		}
	},
	// Success-path sign-in / sign-up logging. Wide events so PostHog can
	// chart sign-ins over time without parsing strings. Errors here must
	// never bubble — a logging failure mustn't break the sign-in itself.
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					try {
						event('auth', 'sign-up {email}', { email: user.email, name: user.name }).done();
					} catch {
						/* never break auth */
					}
				}
			}
		},
		session: {
			create: {
				after: async (session) => {
					try {
						event('auth', 'sign-in {user_id}', { user_id: session.userId }).done();
					} catch {
						/* never break auth */
					}
				}
			}
		}
	},
	plugins: [
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
});
