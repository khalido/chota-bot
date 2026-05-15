import { gatherMorning } from '$lib/server/print/morning';
import { morningToSections } from '$lib/server/print/sections';
import type { PageServerLoad } from './$types';

/**
 * Both this page and the plain-text print share `morningToSections()` —
 * one source of truth. The Svelte page just renders the resulting
 * `PrintSection[]` (typed via inference from this load).
 */
export const load: PageServerLoad = async () => {
	const d = await gatherMorning();
	return { date: d.date, sections: morningToSections(d), closing: d.closing };
};
