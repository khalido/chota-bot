import { error } from '@sveltejs/kit';
import { findMember } from '#lib/server/config.ts';
import { EVERYONE, jobsFor } from '#lib/server/userjobs.ts';
import {
	sydneyDateLong,
	sydneyDateMedium,
	sydneyHHMM,
	sydneyYMD,
	sydneyYMDOffset
} from '#lib/time.ts';
import type { PageServerLoad } from './$types';

/** "Today 16:00", "Tomorrow 07:15", else "Mon 16 Nov 07:15". */
function whenLabel(at: Date, now: Date): string {
	const ymd = sydneyYMD(at);
	const day =
		ymd === sydneyYMD(now)
			? 'Today'
			: ymd === sydneyYMDOffset(1, now)
				? 'Tomorrow'
				: sydneyDateMedium(at);
	return `${day} ${sydneyHHMM(at)}`;
}

/**
 * One person's phone page, `/me/<who>`: the start of the companion app
 * (docs/phone.md). Read-only and open on the LAN and tailnet like
 * `/print/<who>`; there is no family sign-in yet, so nothing here can be
 * changed and anyone on the network can read it.
 */
export const load: PageServerLoad = ({ params }) => {
	const person = findMember(params.who);
	if (!person) error(404, `No one called ${params.who}`);
	const now = new Date();
	return {
		name: person.name,
		today: sydneyDateLong(now),
		reminders: jobsFor(person.name).map((j) => ({
			id: j.id,
			text: j.text,
			when: j.nextRunAt ? whenLabel(j.nextRunAt, now) : '',
			repeats: j.cron !== null,
			paused: !j.enabled,
			everyone: j.owner === EVERYONE
		}))
	};
};
