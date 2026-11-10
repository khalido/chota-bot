import { getSchedule, refreshTimetable } from '#lib/server/tools/sentral.ts';
import { logErr, errorMessage } from '#lib/server/log.ts';
import type { RequestHandler } from './$types';

/**
 * GET  /api/sentral/<person>          → today's periods (from the cached .ics)
 * POST /api/sentral/<person>          → re-download the .ics with the stored cookie, then today's periods
 */
export const GET: RequestHandler = async ({ params }) => {
	const periods = await getSchedule(params.person);
	return Response.json({ person: params.person, count: periods.length, periods });
};

export const POST: RequestHandler = async ({ params }) => {
	try {
		const r = await refreshTimetable(params.person);
		const periods = await getSchedule(params.person);
		return Response.json({ ok: true, person: params.person, ...r, today: periods.length, periods });
	} catch (err) {
		const message = errorMessage(err);
		logErr('sentral', `refresh ${params.person} failed:`, err);
		return Response.json({ ok: false, person: params.person, error: message }, { status: 502 });
	}
};
