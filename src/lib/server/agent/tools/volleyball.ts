/**
 * volleyball agent-tool — the kids' next games + duty rosters.
 *
 * Wraps `$lib/server/tools/volleyball > getKidFixtures`. No args: which kids
 * play, their teams and division draw URLs all come from `chota.config.ts`.
 * Returns the next round per kid whenever it is (not just this weekend), so
 * the agent can answer mid-week questions too. Duty games matter — the team
 * has to show up to staff them, so they're part of "what's on".
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getKidFixtures } from '$lib/server/tools/volleyball';

export const volleyballTool = tool({
	description:
		'The kids\' upcoming volleyball from the official Volleyball NSW draw: next round date, game time, court, venue, opponent (with their ladder rank + points), and any duty roster (the team must attend duty games too). This is the AUTHORITATIVE source for volleyball — family-calendar events that mention volleyball are hand-typed reminders and may be stale or vague; always prefer this tool for game details. Use for "when is volleyball", "what court is X on", "who do we play this weekend", "does anyone have duty".',
	inputSchema: z.object({}),
	execute: async () => {
		const fixtures = await getKidFixtures();
		if (fixtures.length === 0) return { fixtures: [], note: 'no upcoming fixtures found' };
		return {
			fixtures: fixtures.map((f) => ({
				kid: f.kid,
				division: f.division,
				round: f.round,
				date: f.date,
				game: f.playing
					? {
							time: f.playing.time,
							court: f.playing.court,
							venue: f.playing.venue,
							opponent: f.opponent,
							opponentLadder: f.opponentRank
								? `#${f.opponentRank.rank} of ${f.opponentRank.of}, ${f.opponentRank.points}pts`
								: null
						}
					: null,
				duty: f.duty ? { time: f.duty.time, court: f.duty.court } : null
			}))
		};
	}
});
