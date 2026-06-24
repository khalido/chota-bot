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
import { scheduleSection, schoolBreakSection } from './school-section';

type BodyByKind =
	| { kind: 'lines'; lines: string[] }
	| { kind: 'weather'; icon: string; lines: string[] }
	| {
			kind: 'events';
			events: { time: string; summary: string; people: string[] }[];
			/** To-dos listed under the events — each with its due-window (today /
			    tomorrow / overdue) and the people (TickTick tags) it's assigned to.
			    `daysLate` rides along for overdue tasks (drives the 1-bell vs
			    2-bells urgency icon in BriefSheet). */
			tasks: {
				title: string;
				when: 'today' | 'tomorrow' | 'overdue';
				people: string[];
				daysLate?: number;
			}[];
	  }
	| { kind: 'chores'; rows: { person: string; chores: string }[] }
	| {
			/** The shopping list (everyone), plus an evening recap of items bought today. */
			kind: 'shopping';
			items: string[];
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
			/** Upcoming NSW school dates (dev days, term ends) — footnotes after the rows. */
			upcoming?: { label: string; when: string }[];
			/** The school-run bus line, appended at the end ("501 at 7:42am, …"). */
			busLine?: string;
	  }
	| { kind: 'puzzle'; q: string }
	| { kind: 'fact'; text: string; image?: string }
	| {
			/** A TV / comic-strip quote — body lines plus a separate attribution
			    so a renderer can set it inline and styled, not as a stray line. */
			kind: 'quote';
			lines: string[];
			attribution: string;
	  };

/**
 * `subhead`: render the section's header one notch smaller — for a section
 * that reads as a child of the one above it (kids' TODOS under TODAY) rather
 * than a peer. Structural still a separate numbered section; only the HTML
 * renderer's header size changes (the ASCII renderer ignores it).
 */
export type PrintSectionBody = { title: string; subhead?: boolean } & BodyByKind;
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

/**
 * Recipients the scheduled weekday `morning-print` job produces a sheet for:
 * family members whose `autoPrint` isn't disabled (defaults on), lowercased.
 * Falls back to all kids when no `family` roster is configured. On-demand
 * prints and the `/print/<who>` routes use `getRecipients()` (everyone) —
 * turning `autoPrint` off drops the daily sheet, not the person.
 */
export function getAutoPrintRecipients(): readonly string[] {
	const config = getConfig();
	if (config.family?.length) {
		return config.family.filter((m) => m.autoPrint !== false).map((m) => m.name.toLowerCase());
	}
	return config.kids.map((k) => k.name.toLowerCase());
}

/** The whole-family weekend sheet's recipient slug — one print, not per-person. */
export const FAMILY_RECIPIENT = 'family';

/** True for any "who" we know how to render — family-config people + the weekend `'family'` sheet. */
export function isPrintRecipient(who: string): boolean {
	return who === FAMILY_RECIPIENT || getRecipients().includes(who);
}

/** Drop nulls, assign 1-based section numbers. */
function numberSections(bodies: (PrintSectionBody | null)[]): PrintSection[] {
	return bodies
		.filter((b): b is PrintSectionBody => b !== null)
		.map((b, i) => ({ ...b, n: i + 1 }));
}

/** Sort weight for a task's due-window — overdue floats up, tomorrow sinks. */
function taskRank(when: 'today' | 'tomorrow' | 'overdue'): number {
	return when === 'overdue' ? 0 : when === 'today' ? 1 : 2;
}

// ── per-section builders ────────────────────────────────────────────────────

function weatherSection(d: BriefData): PrintSectionBody | null {
	if (!d.weatherLines) return null;
	return {
		title: 'WEATHER',
		kind: 'weather',
		icon: d.weatherIcon ?? 'cloud-sun',
		lines: d.weatherLines
	};
}

/** That person's own todos for the day — overdue first, then today, then tomorrow. */
function ownTodos(d: BriefData, who: string) {
	return d.todos
		.filter((t) => t.people.some((p) => p.toLowerCase() === who.toLowerCase()))
		.sort((a, b) => taskRank(a.when) - taskRank(b.when))
		.map((t) => ({ title: t.title, when: t.when, people: t.people, daysLate: t.daysLate }));
}

/** The shared calendar events for the day, with parsed people chips. */
function dayEvents(d: BriefData) {
	return d.events.map((e) => ({
		time: e.isAllDay ? 'all day' : sydneyTimeRange(e.start, e.end),
		summary: e.summary,
		people: parseEventPeople(e.summary, d.family)
	}));
}

/**
 * A parent's day: shared calendar events with their own todos folded in under
 * them — overdue ones flagged and sorted first. null when the recipient has
 * neither an event nor a task. Kids' briefs split these two into separate
 * TODAY + TODOS sections (`todayEventsSection` + `myTodosSection`) for clarity.
 */
function todaySection(d: BriefData, who: string): PrintSectionBody | null {
	const events = dayEvents(d);
	const tasks = ownTodos(d, who);
	if (!events.length && !tasks.length) return null;
	return { title: d.day === 'tomorrow' ? 'TOMORROW' : 'TODAY', kind: 'events', events, tasks };
}

/**
 * A kid's day: just the shared calendar events, no tasks — paired with
 * `myTodosSection` below so events and to-dos sit in their own boxes on the
 * kid's sheet. Easier for a kid to scan "what's happening" separately from
 * "what do I have to do". null when there are no events.
 */
function todayEventsSection(d: BriefData): PrintSectionBody | null {
	const events = dayEvents(d);
	if (!events.length) return null;
	return { title: d.day === 'tomorrow' ? 'TOMORROW' : 'TODAY', kind: 'events', events, tasks: [] };
}

/**
 * A kid's own to-dos for the day — overdue first, then today, then tomorrow.
 * The kid-side counterpart to the parents-only `todosSection` (which shows
 * every kid's tasks for parent overview). null when this kid has nothing.
 * `subhead`: sits directly under TODAY on the sheet, so it reads as TODAY's
 * to-do list rather than a peer section — smaller header.
 */
function myTodosSection(d: BriefData, who: string): PrintSectionBody | null {
	const tasks = ownTodos(d, who);
	if (!tasks.length) return null;
	return { title: 'TODOS', subhead: true, kind: 'events', events: [], tasks };
}

/** The whole-household chore rota — shown in full on every person's sheet. */
function choresSection(d: BriefData): PrintSectionBody | null {
	const rows = d.chores.map((c) => ({ person: c.person, chores: c.chores.join(', ') }));
	return rows.length ? { title: 'CHORES', kind: 'chores', rows } : null;
}

/**
 * The whole-family TODAY/TOMORROW — the weekend sheet's centre block. Every
 * calendar event (already shared) plus every open `todos` item regardless of
 * assignee, each with its chips. Unassigned tasks get a "Todos" chip.
 */
function familyTodaySection(d: BriefData): PrintSectionBody | null {
	const events = d.events.map((e) => ({
		time: e.isAllDay ? 'all day' : sydneyTimeRange(e.start, e.end),
		summary: e.summary,
		people: parseEventPeople(e.summary, d.family)
	}));
	const tasks = d.todos
		.slice()
		.sort((a, b) => taskRank(a.when) - taskRank(b.when))
		.map((t) => ({
			title: t.title,
			when: t.when,
			// "Todos" chip on unassigned — matches the per-recipient `todosSection`
			// below. "Family" was unclear for kids; "Todos" reads as "anyone".
			people: t.people.length ? t.people : ['Todos'],
			daysLate: t.daysLate
		}));
	if (!events.length && !tasks.length) return null;
	return {
		title: d.day === 'tomorrow' ? 'TOMORROW' : 'TODAY',
		kind: 'events',
		events,
		tasks
	};
}

/**
 * Parents-only overview of the kids' todos for the day — one line per task with
 * its overdue flag and assignee chips, the same layout TODAY uses for events.
 * Unassigned tasks get a "Todos" chip; a parent's own tasks are left out (they
 * read those in their own TODAY section). Overdue tasks sort first. null when
 * nothing is assigned to a kid or unassigned.
 */
function todosSection(d: BriefData): PrintSectionBody | null {
	const kidSet = new Set(d.kids.map((k) => k.toLowerCase()));
	const tasks = d.todos
		.filter((t) => t.people.length === 0 || t.people.some((p) => kidSet.has(p.toLowerCase())))
		.sort((a, b) => taskRank(a.when) - taskRank(b.when))
		.map((t) => ({
			title: t.title,
			when: t.when,
			// "Todos" rather than "Family" on unassigned chips — kids parse it
			// as "tasks anyone can do" more naturally than the word "Family".
			people: t.people.length ? t.people : ['Todos'],
			daysLate: t.daysLate
		}));
	// Section title is TODOS — labels the section as "household to-dos" not
	// "people in the family". FAMILY_RECIPIENT (the route identifier for the
	// weekend whole-household brief) is a separate concept and unchanged.
	return tasks.length ? { title: 'TODOS', kind: 'events', events: [], tasks } : null;
}

/** The shopping list — shown to everyone. The evening brief adds a "bought today" recap. */
function shoppingSection(d: BriefData): PrintSectionBody | null {
	const items = d.shoppingItems.map(shortItem);
	const bought = (d.boughtRecently ?? []).map(shortItem);
	if (!items.length && !bought.length) return null;
	return { title: 'SHOPPING', kind: 'shopping', items, bought };
}

/** Trim a trailing "(brand/note)" then cap length — "Hot Choc powder (Cadbury)" → "Hot Choc powder". */
function shortItem(s: string): string {
	const stripped = s.replace(/\s*\([^)]*\)\s*$/, '').trim() || s.trim();
	return stripped.length > 20 ? `${stripped.slice(0, 19).trimEnd()}…` : stripped;
}

function puzzleSection(d: BriefData): PrintSectionBody {
	return { title: 'PUZZLE', kind: 'puzzle', q: d.puzzle.question };
}

/** A TV / comic-strip quote — a light note on the morning brief's fun tail. */
function funQuoteSection(d: BriefData): PrintSectionBody | null {
	if (!d.funQuote) return null;
	const { quote, speaker, title } = d.funQuote;
	const attribution = speaker ? `${speaker}, ${title}` : title;
	return { title: 'QUOTE', kind: 'quote', lines: quote.split('\n'), attribution };
}

/**
 * A daily picture + fact (bootprint.space). Skipped when the lookup fails. The
 * picture rides along only when `print.factImage` is on — off by default, so
 * the brief stays text-only until the image is deliberately enabled.
 */
function factSection(d: BriefData): PrintSectionBody | null {
	if (!d.fact) return null;
	const withImage = getConfig().print?.factImage ?? false;
	return {
		title: 'DID YOU KNOW',
		kind: 'fact',
		text: d.fact.text,
		...(withImage && d.fact.image ? { image: d.fact.image } : {})
	};
}

// ── briefs ──────────────────────────────────────────────────────────────────

/**
 * The "fun" tail: puzzle + quote on every morning sheet, plus the did-you-know
 * fact for kids only — a parent's sheet stays a get-stuff-done one. The evening
 * (tomorrow) brief drops the whole tail.
 */
function tailSections(d: BriefData, isParent: boolean): (PrintSectionBody | null)[] {
	if (d.day === 'tomorrow') return [];
	return [puzzleSection(d), funQuoteSection(d), isParent ? null : factSection(d)];
}

/**
 * One person's brief. Everyone gets weather + the whole-household chores + the
 * shopping list. A kid also gets their school day (with their bus line) right
 * after weather, then a TODAY section (events) and a separate TODOS section
 * (their own to-dos) — split so each box does one thing. A parent gets a
 * merged TODAY (events + their own todos) plus the parents-only TODOS overview
 * of the kids' tasks further down. The SCHOOL slot holds the timetable on a
 * school day, or — during the holidays, for everyone — a countdown to school
 * coming back. The morning brief also gets a puzzle + quote (+ a did-you-know
 * fact for kids); the evening one drops that tail (`tailSections`).
 *
 * (Later, when each person has their own calendar, the events fed in here
 * become per-recipient; for now the calendar + chores are shared.)
 */
export function recipientToSections(
	who: string,
	d: BriefData,
	schedule: SchedulePeriod[] = []
): PrintSection[] {
	// The weekend "whole family" sheet: one print for everyone, no SCHOOL, no
	// per-person split — every event + every open task on one page.
	if (who === FAMILY_RECIPIENT) {
		return numberSections([
			weatherSection(d),
			familyTodaySection(d),
			choresSection(d),
			shoppingSection(d),
			...tailSections(d, false)
		]);
	}
	const busLine =
		d.schoolBus.find((b) => b.kids.some((k) => k.toLowerCase() === who.toLowerCase()))?.line ??
		null;
	const isParent = !d.kids.some((k) => k.toLowerCase() === who.toLowerCase());
	return numberSections([
		weatherSection(d),
		scheduleSection(schedule, busLine, d.schoolWeek, d.schoolUpcoming) ?? schoolBreakSection(d),
		isParent ? todaySection(d, who) : todayEventsSection(d),
		isParent ? null : myTodosSection(d, who),
		choresSection(d),
		isParent ? todosSection(d) : null,
		shoppingSection(d),
		...tailSections(d, isParent)
	]);
}

// ── text renderer ───────────────────────────────────────────────────────────

/** Plain-text masthead width — Font A on the 80mm head fits ~46 cols. */
const HEADER_COLS = 46;

/**
 * Render `PrintSection[]` to the ASCII print payload: a `Date … Name` masthead
 * (the recipient's name right-aligned), numbered sections, then the closing line.
 */
export function sectionsToText(
	date: string,
	sections: PrintSection[],
	closing: string,
	name: string,
	printedAt: string
): string {
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
				for (const t of s.tasks) {
					const who = t.people.length ? `  (${t.people.join('+')})` : '';
					const tag = t.when === 'overdue' ? 'overdue' : t.when === 'tomorrow' ? 'tmrw' : '';
					lines.push(`${tag.padEnd(11, ' ')}  ${t.title}${who}`);
				}
				break;
			case 'chores':
				for (const r of s.rows) lines.push(`${r.person}: ${r.chores}`);
				break;
			case 'shopping':
				lines.push(...wrapItems(s.items, 44, ''));
				if (s.bought.length) {
					if (s.items.length) lines.push('');
					lines.push('Recently bought:');
					lines.push(...wrapItems(s.bought, 44, ''));
				}
				break;
			case 'schedule':
				for (const r of s.rows) {
					lines.push(`${r.subject}  ${[r.time, r.room].filter(Boolean).join('  ')}`);
					const sub = [r.teacher ? `with ${r.teacher}` : '', r.code ? `(${r.code})` : '']
						.filter(Boolean)
						.join(' ');
					if (sub) lines.push(`  ${sub}`);
				}
				if (s.reminder) lines.push(`  -> ${s.reminder}`);
				for (const u of s.upcoming ?? []) lines.push(`  ${u.label} — ${u.when}`);
				if (s.busLine) lines.push(`  ${s.busLine}`);
				break;
			case 'quote':
				lines.push(...s.lines, `— ${s.attribution}`);
				break;
			case 'puzzle':
				lines.push(s.q);
				break;
			case 'fact':
				lines.push(s.text);
				break;
			default: {
				// Exhaustiveness guard — adding a section kind without a case here
				// (or in <BriefSheet>) is a compile error, not a silent blank.
				const unhandled: never = s;
				throw new Error(`sectionsToText: unhandled section ${JSON.stringify(unhandled)}`);
			}
		}
		lines.push('');
	}
	// Closing line is opt-in — rendered only when something filled it in (no
	// static default; #19 will). Skipping the push keeps the footer tight.
	if (closing) {
		lines.push(closing);
		lines.push('');
	}
	lines.push(`printed ${printedAt}`);
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
