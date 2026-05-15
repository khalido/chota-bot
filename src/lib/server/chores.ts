/**
 * Chores: read from chota.config.ts, return per-person assignments
 * for a given day. Defaults to today (Sydney local).
 *
 * `person` here intentionally matches anyone in the rotation — kid OR adult.
 * The chore assignments in chota.config.ts are just name strings, so a parent
 * can have chores too. (Schema doesn't enforce a person record exists.)
 *
 * Future agent tool will wrap this — keep the API agent-friendly: small
 * named-args object in, flat JSON-able array out.
 */
import { getConfig } from '$lib/server/config';
import type { ChotaConfig, DayOfWeek } from '$lib/config';
import { sydneyDayOfWeek } from '$lib/time';

export interface ChoreAssignment {
	person: string;
	chores: string[];
}

export interface GetChoresOptions {
	/** Defaults to today in Sydney. Ignored if `day` is set. */
	now?: Date;
	/** Filter to a specific day of week. Overrides `now`. */
	day?: DayOfWeek;
	/** Filter to one person. Case-insensitive. */
	person?: string;
}

/**
 * Returns chore assignments for the chosen day, optionally filtered to one
 * person. Empty array if the rotation is missing, the day has no chores,
 * or the filter excludes everyone.
 */
export function getChores(
	opts: GetChoresOptions = {},
	config: ChotaConfig = getConfig()
): ChoreAssignment[] {
	if (!config.chores) return [];

	const day = opts.day ?? sydneyDayOfWeek(opts.now);
	const dayMap = config.chores.rotation[day] ?? {};
	const definitions = config.chores.definitions;
	const filter = opts.person?.toLowerCase();

	const byPerson = new Map<string, string[]>();
	for (const [choreKey, person] of Object.entries(dayMap)) {
		if (!person) continue;
		if (filter && person.toLowerCase() !== filter) continue;
		const description = definitions[choreKey] ?? choreKey;
		if (!byPerson.has(person)) byPerson.set(person, []);
		byPerson.get(person)!.push(description);
	}

	return Array.from(byPerson.entries()).map(([person, chores]) => ({ person, chores }));
}
