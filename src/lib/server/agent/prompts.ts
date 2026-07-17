/**
 * System-prompt composition for the chota agent.
 *
 * Layered:
 *   1. SOUL — static identity, loaded from `soul.md` at the repo root.
 *      Falls back to `soul.example.md` if a personalised soul isn't present
 *      (fresh clones still work). Re-read each call so edits go live
 *      without a server restart.
 *   2. STYLE — static directive about audience, brevity, tool use, output
 *      medium. Doesn't belong in soul.md because it's mechanical.
 *   3. TODAY — Sydney calendar date so the model can resolve relative
 *      phrases ("next Monday") to absolute dates.
 *   4. SNAPSHOT — today's calendar headlines + family-list state (open +
 *      completed-today). Best-effort: a sick integration logs a warning
 *      and the section drops out rather than sinking the whole call.
 *
 * Composed fresh on every `prepareCall`. When prompt-caching lands we'll
 * split SOUL+STYLE (cacheable) from TODAY+SNAPSHOT (per-call) using
 * `SystemModelMessage[]` with `providerOptions.anthropic.cacheControl`.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getChores } from '$lib/server/chores';
import { getConfig } from '$lib/server/config';
import { getCalendar } from '$lib/server/tools/calendar';
import { cleanListName, getFamilyLists } from '$lib/server/tools/ticktick';
import { logger } from '$lib/server/log';
import { sydneyDateLong, sydneyTimeCompact, sydneyYMD } from '$lib/time';

const log = logger('agent/prompts');

const STYLE = `Style guide:
- Audience: a family with kids. Replies must be safe, friendly, age-appropriate.
- Brevity is dignity. Default to one short sentence; two if the matter is grave. Output may be spoken aloud or scrolled across a small screen — prefer plain prose, no lists.
- For kids' "how does X work" / "what is Y" / "why does Z" questions, explain like a smart friend would to a curious 10-year-old: warm, accurate, one sentence in your own voice.
- Use tools when they help — each tool's own description tells you when. Today's Sydney date is below; resolve relative phrases like "next Monday" or "this weekend" to absolute YYYY-MM-DD before calling the calendar.
- Calendar entries (including the snapshot below) are hand-typed reminders. When a domain has its own tool — volleyball fixtures, school timetable, buses, weather — call that tool for details (times, courts, rooms, stops); never answer domain details from a calendar line that merely mentions the activity.
- Prefer your own knowledge for well-known facts (science, history, established media). Reach for google_search when the question is time-sensitive (news, latest releases, what's on this week), specific (opening hours, prices, schedules), or you're genuinely unsure. Don't search for things you already know.
- Don't volunteer private family details that weren't asked for, and don't speculate beyond what a tool returned.`;

/** Build the full system prompt fresh. Called from `agent.prepareCall`. */
export async function buildSystemPrompt(now: Date = new Date()): Promise<string> {
	const soul = loadSoul();
	const household = householdBlock();
	const today = `Today is ${sydneyDateLong(now)} (${sydneyYMD(now)}). All dates and times are Sydney local.`;
	const snapshot = await todaySnapshot(now);
	return [soul, STYLE, household, today, snapshot].filter(Boolean).join('\n\n');
}

/**
 * Static household block from `chota.config.ts` — roster of who the agent
 * might be asked about, plus location for weather context. Cheap to read
 * (in-memory config object); rebuilt per call so a hot-reload of
 * chota.config.ts is reflected immediately.
 *
 * Aliases are exposed so the model knows "Sparky" → "Kid1" and can match
 * the same names the calendar tool already tags events with via
 * `parseEventPeople`.
 */
function householdBlock(): string {
	const cfg = getConfig();
	const lines: string[] = ['Household:'];

	const family = cfg.family ?? [];
	if (family.length > 0) {
		const roster = family
			.map((m) => {
				const others = m.aliases.filter((a) => a.toLowerCase() !== m.name.toLowerCase());
				return others.length > 0 ? `${m.name} (also: ${others.join(', ')})` : m.name;
			})
			.join('; ');
		lines.push(`- People: ${roster}.`);
	}

	if (cfg.home?.suburb) {
		lines.push(`- Location: ${cfg.home.suburb}, Sydney.`);
	}

	return lines.length > 1 ? lines.join('\n') : '';
}

/**
 * One-screen summary of today: calendar headlines, family-list open items,
 * family-list items ticked off today. Each leg is fetched independently and
 * swallowed on failure — the soul + style + date will still ship even if
 * ticktick or calendar is down.
 */
async function todaySnapshot(now: Date): Promise<string> {
	const [events, lists] = await Promise.all([
		getCalendar({ range: 'today' }).catch((err) => {
			log.warn('snapshot calendar fetch failed: {error}', { error: errText(err) });
			return [];
		}),
		getFamilyLists().catch((err) => {
			log.warn('snapshot ticktick fetch failed: {error}', { error: errText(err) });
			return [];
		})
	]);

	const lines: string[] = ['Today at a glance:'];

	// Calendar — first 5 with start time (or "all-day").
	if (events.length === 0) {
		lines.push('- Calendar: nothing scheduled today.');
	} else {
		const top = events
			.slice(0, 5)
			.map((e) => (e.isAllDay ? e.summary : `${sydneyTimeCompact(e.start)} ${e.summary}`));
		const more = events.length > 5 ? ` (+${events.length - 5} more)` : '';
		lines.push(`- Calendar: ${top.join('; ')}${more}.`);
	}

	// Today's chores — from `chota.config.ts > chores.rotation`. Pure config
	// lookup, never throws.
	const chores = getChores({ now });
	if (chores.length > 0) {
		const summary = chores.map((c) => `${c.person}=${c.chores.join('+')}`).join('; ');
		lines.push(`- Chores: ${summary}.`);
	}

	// Family list — open + done-today.
	const familyExternal = getConfig().ticktick?.lists?.family;
	if (familyExternal) {
		const family = lists.find(
			(l) => cleanListName(l.project.name).toLowerCase() === familyExternal.toLowerCase()
		);
		const open = (family?.tasks ?? []).slice(0, 5).map((t) => t.title);
		const todayKey = sydneyYMD(now);
		const doneToday = (family?.done ?? [])
			.filter((d) => sydneyYMD(d.completedAt) === todayKey)
			.map((d) => d.title);

		if (open.length === 0) lines.push('- Family list: clear.');
		else lines.push(`- Family list (open): ${open.join('; ')}.`);
		if (doneToday.length > 0) {
			lines.push(`- Family list (done today): ${doneToday.join('; ')}.`);
		}
	}

	return lines.join('\n');
}

/**
 * Read the soul file from the repo root. Tries `soul.md` first
 * (gitignored, personal); falls back to `soul.example.md` (committed
 * starter). Returns '' if neither is present — never throws, since a
 * missing soul shouldn't sink the agent.
 *
 * `process.cwd()` is the repo root in all our entry paths (`npm run dev`,
 * `node build`, systemd ExecStart) so anchoring there is fine.
 */
function loadSoul(): string {
	const root = process.cwd();
	for (const name of ['soul.md', 'soul.example.md']) {
		try {
			return readFileSync(resolve(root, name), 'utf-8').trim();
		} catch {
			/* try next */
		}
	}
	log.warn('no soul.md or soul.example.md at repo root — agent will run soulless');
	return '';
}

function errText(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
