// Refresh weather cache every 30 min. Google Weather is quota-bounded and
// changes slowly; 30 min is plenty fresh for the dashboard + morning print.
import { defineJob } from '$lib/server/scheduler';
import { refreshWeather } from '$lib/server/tools/weather';

defineJob('weather-refresh', '*/30 * * * *', async () => {
	const w = await refreshWeather();
	return `${Math.round(w.tempC)} C ${w.condition}`;
});
