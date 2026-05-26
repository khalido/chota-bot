/**
 * POST /api/admin/sentral/refresh/<who> — manually trigger a Sentral
 * timetable fetch for one kid. Self-heals the cookie via agent-browser
 * if the stored one is dead; returns the byte count + event count of
 * the freshly-saved .ics.
 *
 * No auth check: the box is tailnet-private and the /admin UI gates
 * entry via better-auth UI. Adding a server-side session check here
 * would break the Refresh button when the user signs in on one
 * hostname (e.g. localhost on the box) but accesses from another (e.g.
 * http://pop-os via Tailscale) — cookies are host-scoped.
 *
 * TODO: re-add `if (!locals.session?.userId) throw error(401, …)` once
 * we have a single canonical ORIGIN (Caddy + portless URL + Google
 * OAuth allowed redirects all aligned). See docs/deploy.md "Reverse
 * proxy" section.
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
