import { gatherMorning } from '$lib/server/print/morning';
import { recipientToSections } from '$lib/server/print/sections';
import { getSchedule, configuredSentralKids } from '$lib/server/tools/sentral';
import type { PageServerLoad } from './$types';

/** Preview of every configured recipient's brief, side by side. `family` always; plus each kid with a Sentral config. */
export const load: PageServerLoad = async () => {
	const recipients = ['family', ...configuredSentralKids()];
	const d = await gatherMorning();
	const briefs = await Promise.all(
		recipients.map(async (who) => ({
			who,
			mark: who === 'family' ? undefined : who[0].toUpperCase(),
			sections: recipientToSections(who, d, who === 'family' ? [] : await getSchedule(who))
		}))
	);
	return { date: d.date, closing: d.closing, briefs };
};
