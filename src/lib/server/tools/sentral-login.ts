/**
 * Sentral login via agent-browser — fetches a fresh session cookie when the
 * stored one has expired.
 *
 * The flow (mapped by hand against the real NSW DoE / Sentral SAML chain):
 *   1. Sentral portal `/auth/portal#!/login` → click "Student"
 *   2. Microsoft login → fill email → "Next"
 *   3. NSW DoE ADFS (fs.det.nsw.edu.au) → fill password, "Keep me signed in",
 *      "Sign in". The username auto-prefills from the email.
 *   4. SAML "Welcome" interstitial → re-open the Sentral portal so SSO completes
 *   5. read the session cookies (SID, PortalSID2, …) off the logged-in page
 *
 * Drives agent-browser via execFile (no shell — credentials never touch a
 * command line a shell would log), the same way print/snapshot.ts does.
 * Requires agent-browser on PATH with its browser installed.
 *
 * Caveat: this and the print screenshot path share one agent-browser browser
 * and aren't locked against each other. A login overlapping a print could make
 * one fail — the print falls back to the canvas renderer, the login throws and
 * the next refresh retries. The job schedules don't overlap in practice
 * (sentral-refresh 06:30, morning-print 06:45).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { log } from '$lib/server/log';

const exec = promisify(execFile);
const CMD_TIMEOUT_MS = 30_000;

/** Sentral session cookie names handed back to refreshTimetable's fetch. */
const SENTRAL_COOKIE_NAMES = ['SID', 'PortalSID2', 'SentralAnon', 'PortalLoggedIn', 'device'];

export interface SentralCredentials {
	/** Sentral base URL, e.g. https://yourschool.sentral.com.au/s-xxxxxx */
	baseUrl: string;
	email: string;
	password: string;
}

/**
 * Log in to Sentral through the NSW DoE SAML flow and return the session
 * cookie string (ready for a `cookie:` request header). Throws with a clear
 * message on bad credentials or if the flow doesn't reach the student portal.
 */
export async function loginSentral(creds: SentralCredentials): Promise<string> {
	const loginUrl = `${new URL(creds.baseUrl).origin}/auth/portal#!/login`;
	const ab = (args: string[]) => exec('agent-browser', args, { timeout: CMD_TIMEOUT_MS });

	try {
		// 1. Sentral portal → Student.
		await ab(['open', loginUrl]);
		await ab(['wait', '--load', 'networkidle']);
		await ab(['find', 'role', 'button', 'click', '--name', 'Student']);

		// 2. Microsoft login: email → Next. `loginfmt` / `idSIButton9` are
		//    long-stable Microsoft login element ids.
		await ab(['wait', '--text', 'Sign in']);
		await ab(['fill', 'input[name=loginfmt]', creds.email]);
		await ab(['click', '#idSIButton9']);

		// 3. NSW DoE ADFS: password (+ keep signed in) → Sign in. The username
		//    auto-prefills from the email, so only the password is filled. Wait
		//    for ADFS-specific text — there's an MS interstitial first. ADFS
		//    element ids (`passwordInput`, `kmsiInput`, `submitButton`) are
		//    long-stable; note the Sign-in control is a <span>, not a <button>.
		await ab(['wait', '--text', 'department account']);
		await ab(['fill', '#passwordInput', creds.password]);
		// "Keep me signed in" — best effort; a longer-lived session means the
		// cookie lasts longer between re-logins.
		await ab(['check', '#kmsiInput']).catch(() => {});
		await ab(['click', '#submitButton']);
		await ab(['wait', '--load', 'networkidle']);

		// 4. Bad credentials keep us on the ADFS page with an error.
		const adfsUrl = (await ab(['get', 'url'])).stdout.trim();
		if (adfsUrl.includes('fs.det.nsw.edu.au')) {
			const text = (await ab(['get', 'text', 'body'])).stdout;
			if (/incorrect user id or password/i.test(text)) {
				throw new Error(
					'Sentral login failed: incorrect username or password. Check SENTRAL_<NAME>_EMAIL / _PASSWORD in .env.'
				);
			}
			throw new Error(`Sentral login stuck on the ADFS page: ${adfsUrl}`);
		}

		// 5. SAML "Welcome" interstitial → re-open the portal so SSO completes.
		await ab(['open', loginUrl]);
		await ab(['wait', '--load', 'networkidle']);

		// 6. Confirm we reached the student portal, then read the cookies.
		const finalUrl = (await ab(['get', 'url'])).stdout.trim();
		if (!finalUrl.includes('/portal/')) {
			throw new Error(`Sentral login did not reach the student portal (ended at ${finalUrl}).`);
		}
		const cookie = pickSentralCookies((await ab(['cookies', 'get'])).stdout);
		if (!cookie) throw new Error('Sentral login succeeded but no session cookies were found.');
		log('sentral', 'loginSentral: fresh session cookie obtained');
		return cookie;
	} finally {
		await ab(['close']).catch(() => {});
	}
}

/**
 * Pull the Sentral session cookies out of `agent-browser cookies get` output
 * (plain `name=value` lines) and join them into a `cookie:` header string.
 * Picks by known cookie name; first occurrence of each name wins.
 */
function pickSentralCookies(dump: string): string {
	const found = new Map<string, string>();
	for (const line of dump.split('\n')) {
		const m = /^([A-Za-z0-9_]+)=(.*)$/.exec(line.trim());
		if (m && SENTRAL_COOKIE_NAMES.includes(m[1]) && !found.has(m[1])) {
			found.set(m[1], m[2]);
		}
	}
	return [...found].map(([k, v]) => `${k}=${v}`).join('; ');
}
