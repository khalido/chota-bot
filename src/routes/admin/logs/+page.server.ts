/**
 * /admin/logs — load the latest tail of the on-disk LogTape file on
 * first paint. The page then auto-refreshes by polling /api/admin/logs
 * every 30s (only while the tab is visible).
 */
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	const r = await fetch('/api/admin/logs?lines=200');
	if (!r.ok) return { entries: [], total: 0, file: '' };
	return r.json();
};
