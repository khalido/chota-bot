/**
 * tmdb agent-tool — "where can I watch X" → AU streaming providers.
 *
 * Wraps `$lib/server/tools/tmdb`. Searches movies + TV in parallel and
 * returns whichever match TMDB ranks higher (popularity), with its AU
 * watch providers. Provider data is TMDB-via-JustWatch, region=AU.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { enrichMovie, enrichTv } from '$lib/server/tools/tmdb';

export const tmdbTool = tool({
	description:
		'Find a movie or TV show and list where it streams in Australia. Use for "where can I watch X", "is X on Netflix".',
	inputSchema: z.object({
		title: z.string().describe('Title to search — movie or TV show.')
	}),
	execute: async ({ title }) => {
		const [movie, tv] = await Promise.all([enrichMovie(title), enrichTv(title)]);
		const candidates = [movie, tv].filter((c) => c !== null);
		if (candidates.length === 0) return { match: null };
		const best = candidates.reduce((a, b) => (a.popularity >= b.popularity ? a : b));
		return {
			match: {
				kind: best.kind,
				title: best.title,
				year: best.year,
				providers: best.providers.map((p) => ({ name: p.name, type: p.type })),
				watchLink: best.watchLink
			}
		};
	}
});
