import { gatherBrief } from '$lib/server/print/brief';
import { recipientToSections, getRecipients } from '$lib/server/print/sections';
import type { PageServerLoad } from './$types';

/**
 * On-screen preview of the morning brief — the shared household sections
 * (`recipientToSections` with no schedule, so no SCHOOL block). The printed
 * sheets and the `/print/<who>` pages are the per-person view.
 */
export const load: PageServerLoad = async () => {
	const who = getRecipients()[0] ?? '';
	const d = await gatherBrief();
	return { date: d.date, sections: recipientToSections(who, d), closing: d.closing };
};
