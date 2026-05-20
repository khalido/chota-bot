import { getConfig } from '$lib/server/config';
import { getFamilyLists } from '$lib/server/tools/ticktick';
import { sydneyYMD, sydneyDayOfWeek } from '$lib/time';
import { logErr } from '$lib/server/log';
import type { PageServerLoad } from './$types';

/** "today" / "yesterday" / weekday (Sydney-local) for a completion date. */
function relativeDay(completedAt: Date, now: Date): string {
	const ymd = sydneyYMD(completedAt);
	if (ymd === sydneyYMD(now)) return 'today';
	if (ymd === sydneyYMD(new Date(now.getTime() - 86_400_000))) return 'yesterday';
	return sydneyDayOfWeek(completedAt);
}

export const load: PageServerLoad = async () => {
	const configured = Object.keys(getConfig().ticktick?.lists ?? {}).length > 0;
	if (!configured) return { configured: false as const, lists: [], error: null };

	try {
		const now = new Date();
		// Each list carries its recently-`done` items; pre-format the completion
		// date here — a relative-day string can't be computed in the component
		// (a mutable `Date` there trips the svelte/prefer-svelte-reactivity rule).
		const lists = (await getFamilyLists()).map((l) => ({
			...l,
			done: (l.done ?? []).map((t) => ({
				id: t.id,
				title: t.title,
				when: relativeDay(t.completedAt, now)
			}))
		}));
		return { configured: true as const, lists, error: null };
	} catch (err) {
		logErr('lists', 'ticktick lookup failed:', err);
		return {
			configured: true as const,
			lists: [],
			error: err instanceof Error ? err.message : String(err)
		};
	}
};
