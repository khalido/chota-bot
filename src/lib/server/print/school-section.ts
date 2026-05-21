/**
 * The SCHOOL section — the most layered of the brief's sections, so it lives
 * in its own file (per the `print/` convention of flat sibling modules like
 * `weather-block.ts`).
 *
 * Two mutually-exclusive builders feed the same SCHOOL slot of a brief:
 *  - `scheduleSection` — a kid's timetable on a school day, the week folded
 *    into the header, a sport nudge, upcoming key dates and the school-run bus.
 *  - `schoolBreakSection` — during the holidays, a countdown to school coming
 *    back, shown to everyone (there's no per-kid timetable then).
 *
 * Both return a `PrintSectionBody`. This file owns the *building* — the two
 * renderers (`sectionsToText`, `<BriefSheet>`) stay central folds over the
 * section union.
 */
import type { BriefData } from './brief';
import type { PrintSectionBody } from './sections';
import type { SchedulePeriod } from '$lib/server/tools/sentral';
import { sydneyTimeRange } from '$lib/time';

/**
 * A kid's school day: the periods, the week folded into the header
 * ("SCHOOL · T1 Wk3"), a sport nudge when relevant, upcoming NSW key dates and
 * the school-run bus line. null on weekends / no-school / fetch-failed.
 */
export function scheduleSection(
	periods: SchedulePeriod[],
	busLine: string | null | undefined,
	schoolWeek: BriefData['schoolWeek'],
	schoolUpcoming: BriefData['schoolUpcoming']
): PrintSectionBody | null {
	if (!periods.length) return null;
	const rows = periods.map((p) => ({
		time: sydneyTimeRange(p.start, p.end),
		subject: p.subject,
		code: p.code,
		room: p.room,
		teacher: abbreviateTeacher(p.teacher),
		period: p.period
	}));
	const reminder = rows.some((r) => /\bsport\b/i.test(r.subject))
		? 'Take sports stuff!'
		: undefined;
	return {
		title: schoolWeek ? `SCHOOL · T${schoolWeek.term} Wk${schoolWeek.week}` : 'SCHOOL',
		kind: 'schedule',
		rows,
		...(reminder ? { reminder } : {}),
		...(schoolUpcoming.length ? { upcoming: schoolUpcoming } : {}),
		...(busLine ? { busLine } : {})
	};
}

/**
 * The holiday countdown — shown when school is out (there's no timetable for
 * anyone). A plain two-line block: "School holidays" + the days until it
 * resumes. null when the family isn't currently on a break.
 */
export function schoolBreakSection(d: BriefData): PrintSectionBody | null {
	if (!d.schoolBreak) return null;
	const { days, resumesLabel } = d.schoolBreak;
	const countdown =
		days <= 1
			? `Back at school tomorrow — ${resumesLabel}`
			: `${days} days till school — back ${resumesLabel}`;
	return { title: 'SCHOOL', kind: 'lines', lines: ['School holidays', countdown] };
}

/** "Ms Example Teacher" → "Ms E. Teacher" (keep an honorific, abbreviate the first name). */
function abbreviateTeacher(full?: string): string | undefined {
	if (!full) return undefined;
	const parts = full.trim().split(/\s+/);
	if (parts.length < 2) return full;
	const hasTitle = /^(mr|mrs|ms|miss|mx|dr)\.?$/i.test(parts[0]);
	if (hasTitle) {
		if (parts.length < 3) return full; // "Mr Smith" — nothing to abbreviate
		return `${parts[0]} ${parts[1][0].toUpperCase()}. ${parts.slice(2).join(' ')}`;
	}
	return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(' ')}`;
}
