/**
 * `PrintSection` — the structured intermediate between gathered data and the
 * two renderers (plain-text print, styled HTML page). A section carries data,
 * not formatting; `sectionsToText()` and `<BriefSheet>` each turn
 * `PrintSection[]` into their own output.
 *
 * Composition: small per-section *builders* return a `PrintSectionBody | null`
 * (null = nothing to show, skip). `numberSections()` drops the nulls and
 * assigns the `01/02/…` numbers. `morningToSections()` is the family brief;
 * `recipientToSections(who, …)` assembles a per-person brief (e.g. a kid
 * gets weather + their school timetable + their chore + a puzzle). Choosing
 * what a recipient sees is just code here — no JSON config / registry yet.
 */
import type { MorningData } from './morning';
import { configuredSentralKids, type SchedulePeriod } from '$lib/server/tools/sentral';
import { parseEventPeople } from '$lib/server/people';
import { sydneyTimeRange } from '$lib/time';

type BodyByKind =
	| { kind: 'lines'; lines: string[] }
	| { kind: 'weather'; icon: string; lines: string[] }
	| { kind: 'events'; events: { time: string; summary: string; people: string[] }[] }
	| { kind: 'chores'; rows: { person: string; chores: string }[] }
	| {
			/** The TickTick block: the shopping list, then anything due today/tomorrow. */
			kind: 'ticktick';
			shopping: string[];
			due: { list: string; title: string; when: string }[];
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

/** Known print recipients = `family` (the original Daily Shout) + every kid with a configured Sentral cookie. */
export function getRecipients(): readonly string[] {
	return ['family', ...configuredSentralKids()];
}

/** Drop nulls, assign 1-based section numbers. */
function numberSections(bodies: (PrintSectionBody | null)[]): PrintSection[] {
	return bodies.filter((b): b is PrintSectionBody => b !== null).map((b, i) => ({ ...b, n: i + 1 }));
}

// ── per-section builders ────────────────────────────────────────────────────

function weatherSection(d: MorningData): PrintSectionBody | null {
	if (!d.weatherLines) return null;
	return { title: 'WEATHER', kind: 'weather', icon: d.weatherIcon ?? 'cloud-sun', lines: d.weatherLines };
}

function todaySection(d: MorningData): PrintSectionBody | null {
	if (!d.events.length) return null;
	return {
		title: 'TODAY',
		kind: 'events',
		events: d.events.map((e) => ({
			time: e.isAllDay ? 'all day' : sydneyTimeRange(e.start, e.end),
			summary: e.summary,
			people: parseEventPeople(e.summary, d.family)
		}))
	};
}

/** All chores, or just `person`'s when given. */
function choresSection(d: MorningData, person?: string): PrintSectionBody | null {
	const rows = d.chores
		.filter((c) => !person || c.person.toLowerCase() === person.toLowerCase())
		.map((c) => ({ person: c.person, chores: c.chores.join(', ') }));
	return rows.length ? { title: 'CHORES', kind: 'chores', rows } : null;
}

/**
 * The TickTick block: the shopping list (the headline — the kids check what's
 * being bought and add to it), then anything across the other lists due today
 * or tomorrow. null when both are empty.
 */
function ticktickSection(d: MorningData): PrintSectionBody | null {
	const shopping = d.shoppingItems.map(shortItem);
	const due = d.dueSoon.flatMap((g) => g.items.map((it) => ({ list: g.list, title: it.title, when: it.when })));
	if (!shopping.length && !due.length) return null;
	return { title: 'TICKTICK', kind: 'ticktick', shopping, due };
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

function puzzleSection(d: MorningData): PrintSectionBody {
	return { title: 'PUZZLE', kind: 'puzzle', q: d.puzzle.q };
}

/** A daily picture + fact (bootprint.space). Skipped when the lookup fails. */
function factSection(d: MorningData): PrintSectionBody | null {
	if (!d.fact) return null;
	return { title: 'DID YOU KNOW', kind: 'fact', text: d.fact.text, ...(d.fact.image ? { image: d.fact.image } : {}) };
}

// ── briefs ──────────────────────────────────────────────────────────────────

/** The family brief — no school section (so no bus), just the household stuff. */
export function morningToSections(d: MorningData): PrintSection[] {
	return numberSections([
		weatherSection(d),
		todaySection(d),
		choresSection(d),
		ticktickSection(d),
		puzzleSection(d),
		factSection(d)
	]);
}

/**
 * A per-recipient brief. `family` → the household brief; a kid → that brief
 * plus their school day (with their bus line at the end of it) inserted right
 * after weather. On weekends/no-school `scheduleSection` is null, so a kid's
 * brief == family's. (Later, when each kid has their own calendar/lists, the
 * data fed in here becomes per-recipient; for now it's all shared.)
 */
export function recipientToSections(who: string, d: MorningData, schedule: SchedulePeriod[] = []): PrintSection[] {
	if (who === 'family') return morningToSections(d);
	const busLine = d.schoolBus.find((b) => b.kids.some((k) => k.toLowerCase() === who.toLowerCase()))?.line ?? null;
	return numberSections([
		weatherSection(d),
		scheduleSection(schedule, busLine),
		todaySection(d),
		choresSection(d),
		ticktickSection(d),
		puzzleSection(d),
		factSection(d)
	]);
}

// ── text renderer ───────────────────────────────────────────────────────────

/** Plain-text masthead width — Font A on the 80mm head fits ~46 cols. */
const HEADER_COLS = 46;

/**
 * Render `PrintSection[]` to the ASCII print payload: a `Date … Name` masthead
 * (the name right-aligned, omitted for the family brief), numbered sections,
 * then the closing line.
 */
export function sectionsToText(date: string, sections: PrintSection[], closing: string, name?: string): string {
	const head =
		name && date.length + name.length + 1 <= HEADER_COLS ? date.padEnd(HEADER_COLS - name.length) + name : name ? `${date}  ${name}` : date;
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
