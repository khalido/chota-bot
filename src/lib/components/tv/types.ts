/** What the Debug screen shows: the Cast proving page's readings. */
export interface TvDebug {
	screen: string;
	uptime: string;
	cast: string;
	version: string;
	lastRefresh: string;
	keys: { id: number; key: string; code: string; at: string }[];
}
