import { getConfig } from '$lib/server/config';
import { getFamilyLists } from '$lib/server/tools/ticktick';
import { logErr } from '$lib/server/log';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const configured = Object.keys(getConfig().ticktick?.lists ?? {}).length > 0;
	if (!configured) return { configured: false as const, lists: [], error: null };

	try {
		return { configured: true as const, lists: await getFamilyLists(), error: null };
	} catch (err) {
		logErr('lists', 'ticktick lookup failed:', err);
		return {
			configured: true as const,
			lists: [],
			error: err instanceof Error ? err.message : String(err)
		};
	}
};
