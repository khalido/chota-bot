/**
 * TMDB agent-tools.
 *
 * - `title_info` — one movie or show: what it is, its AU rating (and whether
 *   it's above PG-13), where it streams in Australia, cinema dates, trailer.
 * - `watch_ideas` — lists to pick from: trending, in AU cinemas, coming
 *   soon, or "something like X".
 *
 * Wraps `$lib/server/tools/tmdb`. Provider data is TMDB-via-JustWatch, AU.
 */
import { tool } from 'ai';
import { z } from 'zod';
import {
	comingSoon,
	inCinemas,
	lookupTitle,
	recommendations,
	trending,
	type TitleMatch
} from '$lib/server/tools/tmdb';

const kind = z.enum(['movie', 'tv']).optional().describe('Leave out unless the user said which.');

export const titleInfoTool = tool({
	description:
		'Look up one movie or TV show: plot, AU age rating (mature = above PG-13), runtime, cast, score, where it streams in Australia, AU cinema/digital release dates, next episode, trailer. Use for "where can I watch X", "is X OK for the kids", "what is X about".',
	inputSchema: z.object({
		title: z.string().describe('Title to search — movie or TV show.'),
		kind,
		year: z.number().int().optional().describe('Release year, to tell remakes apart.')
	}),
	execute: async ({ title, kind, year }) => {
		const t = await lookupTitle(title, { kind, year });
		if (!t) return { match: null };
		return {
			match: {
				kind: t.kind,
				title: t.title,
				year: t.year,
				overview: t.overview,
				genres: t.genres,
				rating: t.rating,
				runtimeMin: t.runtimeMin,
				score: t.votes >= 50 ? t.score : null,
				cast: t.cast,
				makers: t.makers,
				status: t.status,
				seasons: t.seasons,
				nextEpisode: t.nextEpisode,
				releasedAU: t.releasedAU,
				providers: t.providers.map((p) => ({ name: p.name, type: p.type })),
				watchLink: t.watchLink,
				trailer: t.trailer
			}
		};
	}
});

export const watchIdeasTool = tool({
	description:
		'Lists of movies/shows to pick from: trending this week, in Australian cinemas now, coming soon to cinemas, or titles like one the family enjoyed. Follow up with title_info for ratings and where to watch.',
	inputSchema: z.object({
		list: z.enum(['trending', 'in_cinemas', 'coming_soon', 'like']),
		kind: kind.describe('For trending: movies or shows only.'),
		like: z.string().optional().describe('For list "like": the title they enjoyed.')
	}),
	execute: async ({ list, kind, like }) => {
		let hits: TitleMatch[];
		if (list === 'like') {
			if (!like) return { error: 'Say which title, in `like`.' };
			const t = await lookupTitle(like, { kind });
			if (!t) return { match: null };
			hits = await recommendations(t.kind, t.id);
		} else if (list === 'in_cinemas') hits = await inCinemas();
		else if (list === 'coming_soon') hits = await comingSoon();
		else hits = await trending(kind ?? 'all');
		return {
			titles: hits.slice(0, 10).map((h) => ({ kind: h.kind, title: h.title, year: h.year }))
		};
	}
});
