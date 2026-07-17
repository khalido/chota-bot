// Warm the volleyball fixture cache ahead of the Friday prints — games are on
// Sundays and the draw can shift during the week. Two Friday ticks: 06:30
// (before the kids' 06:45 morning briefs, which carry their WEEKEND game) and
// 17:30 (before the 18:00 weekend family sheet). Forces a re-fetch via
// refreshFixtures(); a failed fetch isn't cached, so the print itself retries
// live and degrades to no VOLLEYBALL section rather than failing.
import { defineJob } from '$lib/server/scheduler';
import { refreshFixtures } from '$lib/server/tools/volleyball';

defineJob('volleyball-refresh', '30 6,17 * * 5', async () => {
	const fixtures = await refreshFixtures();
	if (fixtures.length === 0) return 'no upcoming fixtures';
	return fixtures
		.map(
			(f) =>
				`${f.kid}: ${f.round} ${f.date}` +
				(f.playing ? ` ${f.playing.time} ${f.playing.court}` : '') +
				(f.duty ? ' +duty' : '')
		)
		.join('; ');
});
