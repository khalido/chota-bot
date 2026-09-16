/**
 * POST /api/admin/sentral/refresh/<who> — manually trigger a Sentral
 * timetable fetch for one kid. Self-heals the cookie via agent-browser
 * if the stored one is dead; returns the byte count + event count of
 * the freshly-saved .ics.
 *
 * Auth: covered by the deny-by-default guard in hooks.server.ts. Every
 * `/api/*` (except /api/auth, /api/health, /api/print) requires a session
 * whose email is in chota.config.ts > adminEmails, so no per-route check
 * is needed here — and none should be added: an in-route session check
 * would break the Refresh button when the user signs in on one hostname
 * (e.g. localhost on the box) but accesses from another (e.g. http://pop-os
 * over Tailscale), since cookies are host-scoped.
 */
import { json } from '@sveltejs/kit';
import { refreshTimetable } from '$lib/server/tools/sentral';
import { logErr } from '$lib/server/log';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	const who = params.who.toLowerCase();
	try {
		const { bytes, events } = await refreshTimetable(who);
		return json({ ok: true, who, bytes, events });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		logErr('admin·sentral-refresh', `${who}: ${message}`);
		return json({ ok: false, who, error: message }, { status: 500 });
	}
};
