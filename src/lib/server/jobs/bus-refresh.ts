// Refresh bus departures for every configured stop every 5 min. Bus data
// shifts live; tighter window than weather/calendar. Reads the unique
// stop+routes set from chota.config.ts > kids[].buses.
import { defineJob } from '$lib/server/scheduler';
import { refreshAllConfiguredBus } from '$lib/server/tools/bus';

defineJob('bus-refresh', '*/5 * * * *', async () => {
	const n = await refreshAllConfiguredBus();
	return `${n} stop${n === 1 ? '' : 's'}`;
});
