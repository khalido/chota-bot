// One-way sync family TickTick lists to the local in-memory cache every 10
// minutes. Keeps dashboard reads fast and bounded-stale.
import { defineJob } from '$lib/server/scheduler';
import { refreshFamilyLists } from '$lib/server/tools/ticktick';

defineJob('ticktick-refresh', '*/10 * * * *', async () => {
	const lists = await refreshFamilyLists();
	const totalTasks = lists.reduce((n, l) => n + l.tasks.length, 0);
	return `${lists.length} list${lists.length === 1 ? '' : 's'}, ${totalTasks} item${totalTasks === 1 ? '' : 's'}`;
});
