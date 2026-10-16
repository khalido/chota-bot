/**
 * school agent-tools — a kid's timetable for a day, and the NSW school dates.
 *
 * `school_day` wraps `$lib/server/tools/sentral > getSchedule` (the cached
 * Sentral .ics per kid). `school_dates` wraps `$lib/server/tools/schoolterms`
 * (term dates, development days and holidays for the family's division) and
 * answers "when's the last day of term", "when are the holidays", "when do
 * they go back" without the model doing date maths.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { configuredSentralKids, getSchedule } from '$lib/server/tools/sentral';
import {
	getSchoolBreak,
	getSchoolTerms,
	getSchoolWeek,
	getUpcomingSchoolEvents
} from '$lib/server/tools/schoolterms';
import { errorMessage } from '$lib/server/log';
import { sydneyDayOfWeek, sydneyNoon, sydneyTimeRange, sydneyYMD } from '$lib/time';
import { ymd as ymdSchema } from './schemas';

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
const daysBetween = (a: string, b: string) =>
	Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

export const schoolDayTool = tool({
	description:
		'One kid\'s school timetable for a day: periods with times, subjects, rooms and teachers. Use for "what\'s Kid1 got today", "does Kid2 have sport tomorrow", "what room is maths in". Defaults to today. Only kids with a Sentral timetable are covered.',
	inputSchema: z.object({
		kid: z.string().min(1).describe('The kid, by name.'),
		date: ymdSchema.describe('Sydney date; omit for today.').optional()
	}),
	execute: async ({ kid, date }) => {
		const kids = configuredSentralKids();
		const who = kids.find((k) => k === kid.toLowerCase());
		if (!who) return { error: `no timetable for ${kid}`, kidsWithTimetables: kids };
		const ymd = date ?? sydneyYMD();
		const day = sydneyDayOfWeek(sydneyNoon(ymd));
		try {
			const periods = await getSchedule(who, ymd);
			if (periods.length) {
				return {
					kid: who,
					date: ymd,
					day,
					periods: periods.map((p) => ({
						period: p.period ?? null,
						time: sydneyTimeRange(p.start, p.end),
						subject: p.subject,
						room: p.room ?? null,
						teacher: p.teacher ?? null
					})),
					sport: periods.some((p) => /\bsport\b/i.test(p.subject))
				};
			}
			// No periods: say why, so the model doesn't guess.
			if (day === 'Sat' || day === 'Sun') return { kid: who, date: ymd, day, noSchool: 'weekend' };
			const brk = await getSchoolBreak(sydneyNoon(ymd)).catch(() => null);
			if (brk) {
				return { kid: who, date: ymd, day, noSchool: 'holidays', backOn: brk.resumes };
			}
			return {
				kid: who,
				date: ymd,
				day,
				periods: [],
				note: "no timetable for this date — a pupil-free day, or outside the downloaded timetable's range"
			};
		} catch (err) {
			return { error: `timetable unavailable: ${errorMessage(err)}` };
		}
	}
});

export const schoolDatesTool = tool({
	description:
		'NSW public school dates for the family: where we are now (term and week, or holidays), the last day of this term and how many days away it is, when school goes back, all four terms this year, and pupil-free days and holidays in the next ~4 months. Use for "when is the last day of term", "when are the holidays", "when do they go back", "is Monday a pupil-free day".',
	inputSchema: z.object({}),
	execute: async () => {
		const today = sydneyYMD();
		const year = Number(today.slice(0, 4));
		try {
			const [terms, week, brk, upcoming] = await Promise.all([
				getSchoolTerms(year),
				getSchoolWeek(),
				getSchoolBreak(),
				getUpcomingSchoolEvents({ withinDays: 120 })
			]);
			const current = week ? terms.find((t) => t.term === week.term) : undefined;
			const next = terms.find((t) => t.start > today);
			// Late in the year, "when do they go back" means next year's Term 1.
			const nextYear =
				!next && Number(today.slice(5, 7)) >= 10
					? ((await getSchoolTerms(year + 1).catch(() => null))?.[0] ?? null)
					: null;
			// Spelled out so a fast model can't mix up "last day of term" with
			// "first day of holidays".
			const hols = upcoming.find((e) => /holiday/i.test(e.label));
			const backOn = hols
				? (terms.find((t) => t.start > hols.end)?.start ?? nextYear?.start)
				: undefined;
			return {
				today,
				now: current
					? {
							term: current.term,
							week: week!.week,
							lastDay: current.end,
							daysToLastDay: daysBetween(today, current.end)
						}
					: brk
						? { holidays: true, lastDayOfHolidays: brk.until, backOn: brk.resumes }
						: { term: null, note: 'not in a term (between terms or a pupil-free day)' },
				nextHolidays: hols
					? {
							name: hols.label,
							firstDayOfHolidays: hols.start,
							lastDayOfHolidays: hols.end,
							backAtSchool: backOn ?? null
						}
					: null,
				nextTermStarts: next?.start ?? nextYear?.start ?? null,
				terms: terms.map((t) => ({ term: t.term, firstDay: t.start, lastDay: t.end })),
				pupilFreeDaysAndHolidays: upcoming.map((e) => ({
					what: e.label,
					firstDay: e.start,
					lastDay: e.end
				}))
			};
		} catch (err) {
			return { error: `school dates unavailable: ${errorMessage(err)}` };
		}
	}
});
