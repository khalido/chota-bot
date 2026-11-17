/**
 * Data for the TV page: the same reads as the Cast board's screens
 * (#lib/server/tv/screens.ts > gatherTv), cached and warmed by the *-refresh
 * jobs, so the page's once-a-minute reload is cheap.
 */
import { gatherTv } from '#lib/server/tv/screens.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => gatherTv();
