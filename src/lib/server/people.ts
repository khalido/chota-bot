/**
 * Tag calendar events with the family members they belong to.
 *
 * We tokenize the event title on word-boundaries and check every token
 * (case-insensitive) against the alias set in `chota.config.ts > family`.
 * Returns names in family-config order (stable). Empty array = no chip.
 *
 * Examples (with a sample family of Parent1/P1, Parent2/P2, Kid1/K1):
 *   "Lewis Bday for Kid1"   → ["Kid1"]
 *   "Padel P1"              → ["Parent1"]
 *   "P2 & P1 date night"    → ["Parent1", "Parent2"]
 *   "Family BBQ"            → []
 */
import type { FamilyMember } from '$lib/config';

export function parseEventPeople(title: string, family: FamilyMember[] = []): string[] {
	if (!title || family.length === 0) return [];
	const tokens = new Set(
		title
			.toLowerCase()
			.split(/[^a-z0-9]+/)
			.filter(Boolean)
	);
	const matched: string[] = [];
	for (const member of family) {
		if (member.aliases.some((a) => tokens.has(a.toLowerCase()))) {
			matched.push(member.name);
		}
	}
	return matched;
}

/**
 * Resolve the family members a TickTick task is assigned to.
 *
 * TickTick's API exposes no assignee field, so we read assignment from the
 * task's tags — a tag matching a family member's alias (case-insensitive)
 * assigns the task. When no tag matches, we fall back to a name in the title
 * (the same word-boundary match as calendar events). Empty array = unassigned.
 *
 * Names come back in family-config order (stable), like `parseEventPeople`.
 */
export function parseTaskPeople(
	title: string,
	tags: string[] = [],
	family: FamilyMember[] = []
): string[] {
	if (family.length === 0) return [];
	const tagSet = new Set(tags.map((t) => t.toLowerCase()));
	const byTag = family
		.filter((m) => m.aliases.some((a) => tagSet.has(a.toLowerCase())))
		.map((m) => m.name);
	return byTag.length ? byTag : parseEventPeople(title, family);
}
