// What the page renders: the core's state and a clock that ticks once a second. Every time on screen is formatted
// here, in the theme's zone, so blocks never format times themselves.
import { initialState, type State } from '../protocol/core.ts';

class View {
	state = $state.raw<State>(initialState());
	now = $state(Date.now());
}
export const view = new View();

const zone = (tz?: string) => tz ?? view.state.theme.timezone;
// The schema has already refused a zone this Intl doesn't know.
const fmt = (ms: number, o: Intl.DateTimeFormatOptions, tz?: string) =>
	new Intl.DateTimeFormat(undefined, { ...o, timeZone: zone(tz) }).format(ms);

/** "7:40" or "7:40 pm" (theme.hour12). */
export const time = (ms: number, tz?: string) =>
	fmt(
		ms,
		{ hour: 'numeric', minute: '2-digit', hour12: view.state.theme.hour12 ?? false },
		tz
	).replace(/\s?([ap])\.?m\.?$/i, ' $1m');

/** "3 pm" or "15:00", for hour columns. */
export const hour = (ms: number) =>
	view.state.theme.hour12
		? fmt(ms, { hour: 'numeric', hour12: true }).replace(/\s?([ap])\.?m\.?$/i, ' $1m')
		: fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });

/** "Sunday 15 November". */
export const longDate = (ms: number, tz?: string) =>
	fmt(ms, { weekday: 'long', day: 'numeric', month: 'long' }, tz);

/** The calendar day of `ms` in the theme's zone, "2026-11-17". */
export function isoDay(ms: number) {
	const parts = new Intl.DateTimeFormat('en', {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone: zone()
	}).formatToParts(ms);
	const part = (t: string) => parts.find((p) => p.type === t)?.value;
	return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The hour of `ms` with minutes as a fraction (7.5 is 7:30), in the theme's zone. */
export function hourOf(ms: number, tz?: string) {
	const [h, m] = new Intl.DateTimeFormat('en', {
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
		timeZone: zone(tz)
	})
		.format(ms)
		.split(':')
		.map(Number);
	return h + m / 60;
}

/** Whole minutes from now to `ms`. */
export const minutesFrom = (ms: number) => Math.floor((ms - view.now) / 60_000);

export const at = (iso: string) => Date.parse(iso);
