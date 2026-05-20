import { gatherBrief } from '$lib/server/print/brief';
import { recipientToSections, getRecipients } from '$lib/server/print/sections';
import { getSchedule } from '$lib/server/tools/sentral';
import type { PageServerLoad } from './$types';

/** Preview of every family member's brief, side by side — one sheet per person. */
export const load: PageServerLoad = async () => {
	const d = await gatherBrief();
	const briefs = await Promise.all(
		getRecipients().map(async (who) => ({
			who,
			mark: who[0].toUpperCase(),
			sections: recipientToSections(who, d, await getSchedule(who))
		}))
	);
	return { date: d.date, closing: d.closing, briefs };
};
