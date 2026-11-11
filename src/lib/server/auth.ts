import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { sveltekitCookies } from 'better-auth/svelte-kit';

import { hostname } from 'node:os';
import {
	ORIGIN,
	PORT,
	BETTER_AUTH_SECRET,
	GOOGLE_CLIENT_ID,
	GOOGLE_CLIENT_SECRET
} from '$app/env/private';

import { getRequestEvent } from '$app/server';
import { db } from '#lib/server/db/index.ts';
import { event, logger } from '#lib/server/log.ts';

const authLog = logger('auth');

/**
 * The box answers on several names (localhost, its hostname on the LAN, its
 * tailnet name over plain http through Caddy, and the tailnet name over https
 * through Tailscale Serve), so better-auth takes its base URL from each request
 * rather than from one fixed string. With a fixed string its SvelteKit handler
 * only answered `/api/auth/*` on that exact origin and every other name got a
 * 404 (adapter-node 6 no longer rewrites request URLs to `ORIGIN`).
 *
 * - `allowedHosts` match host AND port: `localhost:8000` is a direct hit,
 *   `localhost` is through Caddy on port 80.
 * - No `protocol`: it comes from the request URL, which adapter-node builds
 *   from `PROTOCOL_HEADER` (`x-forwarded-proto`, set by Caddy and by Tailscale
 *   Serve). That header is only safe to trust because the app listens on
 *   127.0.0.1 (`HOST` in `.env`), so nothing reaches it except those proxies.
 *   Without `PROTOCOL_HEADER` every non-loopback host reads as https and
 *   sign-in from `http://<box>` is refused.
 * - `fallback` is needed: jobs call `auth.api.getAccessToken` with no request
 *   (the calendar), and a request on an unlisted host (a bare IP) would
 *   otherwise throw inside `getSession` and turn every page into a 500.
 *
 * Google sign-in still only completes on the origin registered in the Google
 * console, which is `ORIGIN`: start it there. Cookies keep their plain names on
 * every host (not `__Secure-`), so one session store serves http and https.
 */
const box = hostname().toLowerCase();
const signInOrigin = (ORIGIN || `http://localhost:${PORT || 8000}`).replace(/\/$/, '');
const allowedHosts = [
	...new Set([
		new URL(signInOrigin).host,
		`localhost:${PORT || 8000}`,
		'localhost',
		box,
		`${box}.local`,
		`${box}.*.ts.net`
	])
];

export const auth = betterAuth({
	baseURL: { allowedHosts, fallback: signInOrigin },
	secret: BETTER_AUTH_SECRET,
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
			clientId: GOOGLE_CLIENT_ID,
			clientSecret: GOOGLE_CLIENT_SECRET,
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
