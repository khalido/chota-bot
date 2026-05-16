import { error } from '@sveltejs/kit';
import { gatherMorning } from '$lib/server/print/morning';
import { recipientToSections, getRecipients } from '$lib/server/print/sections';
import { getSchedule } from '$lib/server/tools/sentral';
import type { PageServerLoad } from './$types';

/**
 * One recipient's print brief. `/print/family` is the Daily Shout; `/print/<kid>`
 * is their slice (weather + school timetable + their chore + a puzzle). Use
 * `?bare=1` for the clean screenshot/print render (drops the dashboard nav).
 *
 * `?date=YYYY-MM-DD` overrides the school-timetable day (the rest of the brief
 * is always "now"). Lets you reprint a past day's schedule — the cached .ics
 * holds the whole timetable. Omitted → today.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const who = params.who.toLowerCase();
	if (!getRecipients().includes(who)) {
		throw error(404, `Unknown print recipient: ${params.who}`);
	}
	const date = url.searchParams.get('date') ?? undefined;
	const d = await gatherMorning();
	const schedule = who === 'family' ? [] : await getSchedule(who, date);
	return {
		who,
		mark: who === 'family' ? undefined : who[0].toUpperCase(),
		date: d.date,
		sections: recipientToSections(who, d, schedule),
		closing: d.closing
	};
};
