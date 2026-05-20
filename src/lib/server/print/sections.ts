/**
 * `PrintSection` — the structured intermediate between gathered data and the
 * two renderers (plain-text print, styled HTML page). A section carries data,
 * not formatting; `sectionsToText()` and `<BriefSheet>` each turn
 * `PrintSection[]` into their own output.
 *
 * Composition: small per-section *builders* return a `PrintSectionBody | null`
 * (null = nothing to show, skip). `numberSections()` drops the nulls and
 * assigns the `01/02/…` numbers. `recipientToSections(who, …)` assembles one
 * person's brief — everyone gets the household sections; a kid additionally
 * gets their school timetable. Choosing what a recipient sees is just code
 * here — no JSON config / registry yet.
 */
import type { BriefData } from './brief';
import type { SchedulePeriod } from '$lib/server/tools/sentral';
import { getConfig } from '$lib/server/config';
import { parseEventPeople } from '$lib/server/people';
import { sydneyTimeRange } from '$lib/time';

type BodyByKind =
	| { kind: 'lines'; lines: string[] }
	| { kind: 'weather'; icon: string; lines: string[] }
	| { kind: 'events'; events: { time: string; summary: string; people: string[] }[] }
	| { kind: 'chores'; rows: { person: string; chores: string }[] }
	| {
			/** The TickTick block: shopping list, anything due today/tomorrow, items bought today. */
			kind: 'ticktick';
			shopping: string[];
			due: { list: string; title: string; when: string }[];
			/** Shopping items ticked off today — populated on the evening brief only. */
			bought: string[];
	  }
	| {
			kind: 'schedule';
			rows: {
				time: string;
				subject: string;
				code?: string;
				room?: string;
				/** Abbreviated, e.g. "Miss C. Bowles". */
				teacher?: string;
				period?: number;
			}[];
			/** A nudge under the rows, e.g. "Take sports stuff!" — shown when relevant. */
			reminder?: string;
			/** The school-run bus line, appended at the end ("501 at 7:42am, …"). */
			busLine?: string;
	  }
	| { kind: 'puzzle'; q: string }
	| { kind: 'fact'; text: string; image?: string };

export type PrintSectionBody = { title: string } & BodyByKind;
export type PrintSection = PrintSectionBody & { n: number };

/**
 * Print recipients — every member of the family roster in `chota.config.ts`.
 * Falls back to `kids` (always present) if no `family` block is configured, so
 * a minimal config still prints the kids rather than nothing.
 */
export function getRecipients(): readonly string[] {
	const config = getConfig();
	const roster = config.family?.length
		? config.family.map((m) => m.name)
		: config.kids.map((k) => k.name);
	return roster.map((n) => n.toLowerCase());
}

/** Drop nulls, assign 1-based section numbers. */
function numberSections(bodies: (PrintSectionBody | null)[]): PrintSection[] {
	return bodies.filter((b): b is PrintSectionBody => b !== null).map((b, i) => ({ ...b, n: i + 1 }));
}

// ── per-section builders ────────────────────────────────────────────────────

function weatherSection(d: BriefData): PrintSectionBody | null {
	if (!d.weatherLines) return null;
	return { title: 'WEATHER', kind: 'weather', icon: d.weatherIcon ?? 'cloud-sun', lines: d.weatherLines };
}

function todaySection(d: BriefData): PrintSectionBody | null {
	if (!d.events.length) return null;
	return {
		title: d.day === 'tomorrow' ? 'TOMORROW' : 'TODAY',
		kind: 'events',
		events: d.events.map((e) => ({
			time: e.isAllDay ? 'all day' : sydneyTimeRange(e.start, e.end),
			summary: e.summary,
			people: parseEventPeople(e.summary, d.family)
		}))
	};
}

/** The whole-household chore rota — shown in full on every person's sheet. */
function choresSection(d: BriefData): PrintSectionBody | null {
	const rows = d.chores.map((c) => ({ person: c.person, chores: c.chores.join(', ') }));
	return rows.length ? { title: 'CHORES', kind: 'chores', rows } : null;
}

/**
 * The TickTick block: the shopping list (the headline — the kids check what's
 * being bought and add to it), then anything across the other lists due today
 * or tomorrow. null when both are empty.
 */
function ticktickSection(d: BriefData): PrintSectionBody | null {
	const shopping = d.shoppingItems.map(shortItem);
	const due = d.dueSoon.flatMap((g) => g.items.map((it) => ({ list: g.list, title: it.title, when: it.when })));
	const bought = (d.boughtRecently ?? []).map(shortItem);
	if (!shopping.length && !due.length && !bought.length) return null;
	return { title: 'TICKTICK', kind: 'ticktick', shopping, due, bought };
}

/** Trim a trailing "(brand/note)" then cap length — "Hot Choc powder (Cadbury)" → "Hot Choc powder". */
function shortItem(s: string): string {
	const stripped = s.replace(/\s*\([^)]*\)\s*$/, '').trim() || s.trim();
	return stripped.length > 20 ? `${stripped.slice(0, 19).trimEnd()}…` : stripped;
}

/**
 * A kid's school day, with the school-run bus line tacked on the end. null on
 * weekends / no-school / fetch-failed (nothing to print).
 */
function scheduleSection(periods: SchedulePeriod[], busLine?: string | null): PrintSectionBody | null {
	if (!periods.length) return null;
	const rows = periods.map((p) => ({
		time: sydneyTimeRange(p.start, p.end),
		subject: p.subject,
		code: p.code,
		room: p.room,
		teacher: abbreviateTeacher(p.teacher),
		period: p.period
	}));
	const reminder = rows.some((r) => /\bsport\b/i.test(r.subject)) ? 'Take sports stuff!' : undefined;
	return {
		title: 'SCHOOL',
		kind: 'schedule',
		rows,
		...(reminder ? { reminder } : {}),
		...(busLine ? { busLine } : {})
	};
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

function puzzleSection(d: BriefData): PrintSectionBody {
	return { title: 'PUZZLE', kind: 'puzzle', q: d.puzzle.q };
}

/** A daily picture + fact (bootprint.space). Skipped when the lookup fails. */
function factSection(d: BriefData): PrintSectionBody | null {
	if (!d.fact) return null;
	return { title: 'DID YOU KNOW', kind: 'fact', text: d.fact.text, ...(d.fact.image ? { image: d.fact.image } : {}) };
}

// ── briefs ──────────────────────────────────────────────────────────────────

/**
 * The puzzle + fact "fun" tail. The evening (tomorrow) brief drops them — it's
 * a get-ready-for-tomorrow sheet, so it stays to weather/school/events/chores/shopping.
 */
function tailSections(d: BriefData): (PrintSectionBody | null)[] {
	return d.day === 'tomorrow' ? [] : [puzzleSection(d), factSection(d)];
}

/**
 * One person's brief. Everyone gets weather + events + the whole-household
 * chores + the TickTick block; a kid additionally gets their school day (with
 * their bus line) right after weather — `scheduleSection` is null when
 * `schedule` is empty (a parent, a weekend, no school), so their brief is then
 * just the household one. The morning brief also gets a puzzle + fact; the
 * evening one drops them (`tailSections`).
 *
 * (Later, when each person has their own calendar/lists, the data fed in here
 * becomes per-recipient; for now the household sections are shared.)
 */
export function recipientToSections(who: string, d: BriefData, schedule: SchedulePeriod[] = []): PrintSection[] {
	const busLine = d.schoolBus.find((b) => b.kids.some((k) => k.toLowerCase() === who.toLowerCase()))?.line ?? null;
	return numberSections([
		weatherSection(d),
		scheduleSection(schedule, busLine),
		todaySection(d),
		choresSection(d),
		ticktickSection(d),
		...tailSections(d)
	]);
}

// ── text renderer ───────────────────────────────────────────────────────────

/** Plain-text masthead width — Font A on the 80mm head fits ~46 cols. */
const HEADER_COLS = 46;

/**
 * Render `PrintSection[]` to the ASCII print payload: a `Date … Name` masthead
 * (the recipient's name right-aligned), numbered sections, then the closing line.
 */
export function sectionsToText(date: string, sections: PrintSection[], closing: string, name: string): string {
	const head =
		date.length + name.length + 1 <= HEADER_COLS
			? date.padEnd(HEADER_COLS - name.length) + name
			: `${date}  ${name}`;
	const lines: string[] = [head, ''];
	for (const s of sections) {
		lines.push(`${pad2(s.n)} ${s.title}`);
		switch (s.kind) {
			case 'lines':
			case 'weather':
				lines.push(...s.lines);
				break;
			case 'events':
				for (const e of s.events) {
					const who = e.people.length ? `  (${e.people.join('+')})` : '';
					lines.push(`${e.time.padEnd(11, ' ')}  ${e.summary}${who}`);
				}
				break;
			case 'chores':
				for (const r of s.rows) lines.push(`${r.person}: ${r.chores}`);
				break;
			case 'ticktick':
				if (s.shopping.length) {
					lines.push('Shopping:');
					lines.push(...wrapItems(s.shopping, 44, ''));
				}
				if (s.due.length) {
					if (s.shopping.length) lines.push('');
					for (const r of s.due) lines.push(`${r.list}: "${r.title}" (${r.when})`);
				}
				if (s.bought.length) {
					if (s.shopping.length || s.due.length) lines.push('');
					lines.push('Recently bought:');
					lines.push(...wrapItems(s.bought, 44, ''));
				}
				break;
			case 'schedule':
				for (const r of s.rows) {
					lines.push(`${r.subject}  ${[r.time, r.room].filter(Boolean).join('  ')}`);
					const sub = [r.teacher ? `with ${r.teacher}` : '', r.code ? `(${r.code})` : ''].filter(Boolean).join(' ');
					if (sub) lines.push(`  ${sub}`);
				}
				if (s.reminder) lines.push(`  -> ${s.reminder}`);
				if (s.busLine) lines.push(`  ${s.busLine}`);
				break;
			case 'puzzle':
				lines.push(s.q);
				break;
			case 'fact':
				lines.push(s.text);
				break;
		}
		lines.push('');
	}
	lines.push(closing);
	return lines.join('\n');
}

function pad2(n: number): string {
	return n.toString().padStart(2, '0');
}

/**
 * Wrap a comma-joined item list to maxWidth chars per line, prefixed with
 * `indent`. Comma-after-item, no trailing comma. Exported for tests.
 */
export function wrapItems(items: string[], maxWidth: number, indent: string): string[] {
	if (items.length === 0) return [];
	const inner = maxWidth - indent.length;
	const lines: string[] = [];
	let cur = '';
	for (let i = 0; i < items.length; i++) {
		const piece = items[i] + (i < items.length - 1 ? ',' : '');
		if (cur.length === 0) cur = piece;
		else if (cur.length + 1 + piece.length <= inner) cur = `${cur} ${piece}`;
		else {
			lines.push(indent + cur);
			cur = piece;
		}
	}
	if (cur) lines.push(indent + cur);
	return lines;
}
