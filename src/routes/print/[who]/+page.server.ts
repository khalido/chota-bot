import { error } from '@sveltejs/kit';
import { gatherBrief } from '$lib/server/print/brief';
import { recipientToSections, isPrintRecipient } from '$lib/server/print/sections';
import { getSchedule } from '$lib/server/tools/sentral';
import { sydneyYMD } from '$lib/time';
import type { PageServerLoad } from './$types';

/**
 * One family member's print brief — `/print/<who>` (everyone in chota.config.ts
 * gets one, plus `family` for the weekend whole-family sheet). Household
 * sections for all; a kid also gets their school timetable.
 *
 * **Always rendered bare** (no dashboard nav). The +layout.svelte nav-hide
 * triggers on this path so what you see in a browser is what agent-browser
 * captures for the thermal printer — no `?bare=1` flag, the route IS the
 * contract. The multi-person preview WITH nav lives at `/print` (no `[who]`).
 *
 * `?day=tomorrow` shifts the whole brief one day ahead — the evening print's
 * "tomorrow" sheet (weather, school, events, chores, shopping; no puzzle/fact).
 *
 * `?date=YYYY-MM-DD` overrides just the school-timetable day. Lets you reprint
 * a past day's schedule — the cached .ics holds the whole timetable. Omitted →
 * tomorrow's date when `?day=tomorrow`, else today.
 */
export const load: PageServerLoad = async ({ params, url }) => {
	const who = params.who.toLowerCase();
	if (!isPrintRecipient(who)) {
		throw error(404, `Unknown print recipient: ${params.who}`);
	}
	const day = url.searchParams.get('day') === 'tomorrow' ? 'tomorrow' : 'today';
	const date =
		url.searchParams.get('date') ??
		(day === 'tomorrow' ? sydneyYMD(new Date(Date.now() + 86_400_000)) : undefined);
	const d = await gatherBrief({ day });
	const schedule = await getSchedule(who, date);
	return {
		who,
		mark: who[0].toUpperCase(),
		date: d.date,
		sections: recipientToSections(who, d, schedule),
		closing: d.closing,
		printedAt: d.printedAt
	};
};
