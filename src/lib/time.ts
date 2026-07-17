/**
 * Sydney-local time helpers. Pure functions, plain TS, no Svelte deps.
 *
 * The kiosk is in Sydney; everything human-facing should be Sydney local
 * regardless of where the server runs. Use these instead of inlining
 * Intl.DateTimeFormat calls — keeps timezone logic in one place and
 * handles DST (AEST +10:00 / AEDT +11:00) correctly.
 */
import type { DayOfWeek } from '$lib/config';

const TZ = 'Australia/Sydney';

/** "Mon" | "Tue" | ... | "Sun" — short weekday in Sydney local. */
export function sydneyDayOfWeek(d: Date = new Date()): DayOfWeek {
	return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short' }).format(
		d
	) as DayOfWeek;
}

export function sydneyHour(d: Date = new Date()): number {
	return parseInt(
		new Intl.DateTimeFormat('en-US', {
			timeZone: TZ,
			hour: 'numeric',
			hour12: false
		}).format(d),
		10
	);
}

/** "08:42" — 24h, zero-padded. */
export function sydneyHHMM(d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-AU', {
		timeZone: TZ,
		hour: '2-digit',
		minute: '2-digit',
		hour12: false
	}).format(d);
}

/** "2026-05-09" — ISO date, useful for keys + ISO date construction. */
export function sydneyYMD(d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: TZ,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(d);
}

/** "8:42 am" — short 12h, glanceable. */
export function sydneyTimeShort(d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-AU', {
		timeZone: TZ,
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	}).format(d);
}

/**
 * "4pm" / "5:30pm" / "12am" — most compact 12h format, no space, no leading
 * zero, drops `:00` minutes. Use this for printout + dashboard rows.
 */
export function sydneyTimeCompact(d: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone: TZ,
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	}).formatToParts(d);
	const h = parts.find((p) => p.type === 'hour')?.value ?? '?';
	const m = parts.find((p) => p.type === 'minute')?.value ?? '00';
	const dp = (parts.find((p) => p.type === 'dayPeriod')?.value ?? 'AM').toLowerCase();
	return m === '00' ? `${h}${dp}` : `${h}:${m}${dp}`;
}

/**
 * "4-5:15pm" / "11am-1:30pm" / "9am" — collapses am/pm suffix when both
 * sides share it. Returns just the start when end <= start (zero-length or
 * missing). All-day handled by caller.
 */
export function sydneyTimeRange(start: Date, end: Date): string {
	if (end.getTime() <= start.getTime()) return sydneyTimeCompact(start);
	const s = sydneyTimeCompact(start);
	const e = sydneyTimeCompact(end);
	const sSuffix = s.slice(-2);
	const eSuffix = e.slice(-2);
	if (sSuffix === eSuffix) return `${s.slice(0, -2)}-${e}`;
	return `${s}-${e}`;
}

/** "Friday 9 May" — long weekday + day + month, no year. */
export function sydneyDateLong(d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-AU', {
		timeZone: TZ,
		weekday: 'long',
		day: 'numeric',
		month: 'long'
	}).format(d);
}

/** "Tue 26 May" — abbreviated weekday + day + abbreviated month. */
export function sydneyDateMedium(d: Date = new Date()): string {
	return new Intl.DateTimeFormat('en-AU', {
		timeZone: TZ,
		weekday: 'short',
		day: 'numeric',
		month: 'short'
	}).format(d);
}

/** "Thu 9th May" — short weekday + day with English ordinal + short month. */
export function sydneyDateShort(d: Date = new Date()): string {
	const day = parseInt(
		new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric' }).format(d),
		10
	);
	const weekday = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, weekday: 'short' }).format(d);
	const month = new Intl.DateTimeFormat('en-AU', { timeZone: TZ, month: 'short' }).format(d);
	return `${weekday} ${day}${ordinal(day)} ${month}`;
}

/**
 * Build a Date at the given HH:MM Sydney local time on the same Sydney
 * calendar date as `anchor`. Handles DST correctly by reading the actual
 * UTC offset for that moment.
 */
export function sydneyTimeOnDay(hhmm: string, anchor: Date = new Date()): Date {
	const [h, m] = hhmm.split(':').map(Number);
	const ymd = sydneyYMD(anchor);
	return new Date(`${ymd}T${pad(h)}:${pad(m)}:00${sydneyOffset(anchor)}`);
}

/** Returns the Sydney UTC offset for the given moment, e.g. "+10:00" or "+11:00". */
export function sydneyOffset(d: Date = new Date()): string {
	const parts = new Intl.DateTimeFormat('en-GB', {
		timeZone: TZ,
		timeZoneName: 'longOffset'
	}).formatToParts(d);
	const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+10:00';
	const m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName);
	if (!m) return '+10:00';
	return `${m[1]}${pad(parseInt(m[2], 10))}:${m[3] ?? '00'}`;
}

function ordinal(n: number): string {
	const v = n % 100;
	if (v >= 11 && v <= 13) return 'th';
	const last = n % 10;
	return last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
}

function pad(n: number): string {
	return n.toString().padStart(2, '0');
}
