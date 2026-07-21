// Refresh the weather cache every 30 min — sky + sea. Google Weather is
// quota-bounded and changes slowly; 30 min is plenty fresh for the dashboard +
// morning print. The local beach lifeguard report is warmed on the same tick
// (its own 30-min TTL means the RSS is actually fetched at most once per run),
// so "weather" stays one thing to refresh. A dead beach feed doesn't fail the
// job — getBeachReport swallows its own errors and returns null.
import { defineJob } from '$lib/server/scheduler';
import { refreshWeather } from '$lib/server/tools/weather';
import { getBeachReport } from '$lib/server/tools/beach';

defineJob('weather-refresh', '*/30 * * * *', async () => {
	const [w, beach] = await Promise.all([refreshWeather(), getBeachReport()]);
	const sea = beach ? `; ${beach.beach} ${beach.summary}` : '';
	return `${Math.round(w.tempC)} C ${w.condition}${sea}`;
});
