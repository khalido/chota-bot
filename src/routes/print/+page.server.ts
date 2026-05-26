import { gatherBrief } from '$lib/server/print/brief';
import { recipientToSections, getRecipients } from '$lib/server/print/sections';
import { getSchedule } from '$lib/server/tools/sentral';
import { sydneyYMD } from '$lib/time';
import type { PageServerLoad } from './$types';

/**
 * Preview of every family member's brief, side by side — one sheet per person.
 *
 * `?day=tomorrow` shifts every brief one day forward — the evening-print
 * equivalent (no puzzle/fact, weather/calendar/school/chores for tomorrow).
 * Useful when a kid wants to pack tonight for tomorrow's classes.
 *
 * Header in +page.svelte exposes a Today/Tomorrow/Weekend toggle for this.
 * Weekend is a separate route (/print/family) so we don't handle it here.
 */
export const load: PageServerLoad = async ({ url }) => {
	const day: 'today' | 'tomorrow' = url.searchParams.get('day') === 'tomorrow' ? 'tomorrow' : 'today';
	const d = await gatherBrief({ day });
	// Tomorrow's per-kid schedule needs tomorrow's Sydney date, not today's —
	// otherwise the SCHOOL section shows today's classes under a "tomorrow"
	// brief. The .ics holds the whole week, so this is just a date pick.
	const ref =
		day === 'tomorrow'
			? sydneyYMD(new Date(Date.now() + 86_400_000))
			: sydneyYMD(new Date());
	const briefs = await Promise.all(
		getRecipients().map(async (who) => ({
			who,
			mark: who[0].toUpperCase(),
			sections: recipientToSections(who, d, await getSchedule(who, ref))
		}))
	);
	return { date: d.date, closing: d.closing, printedAt: d.printedAt, briefs, day };
};
