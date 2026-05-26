/**
 * POST /api/admin/sentral/refresh/<who> — manually trigger a Sentral
 * timetable fetch for one kid. Self-heals the cookie via agent-browser
 * if the stored one is dead; returns the byte count + event count of
 * the freshly-saved .ics.
 *
 * Session-gated: only signed-in admins (any signed-in user, for now)
 * can poke this. The endpoint takes 5–30s depending on whether a fresh
 * agent-browser login is needed.
 */
import { json, error } from '@sveltejs/kit';
import { refreshTimetable } from '$lib/server/tools/sentral';
import { logErr } from '$lib/server/log';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.session?.userId) throw error(401, 'sign in first');

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
