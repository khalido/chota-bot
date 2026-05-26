/**
 * weather agent-tool — current conditions + today's headline for home.
 *
 * Wraps `$lib/server/tools/weather`. No args: the location comes from
 * `chota.config.ts > home`. Returns a small scalar shape — the full hourly
 * array is dropped; the LLM gets `summary` (the same one-liner the kiosk
 * shows) plus today's min/max so it can answer "should I take a jacket?".
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getWeather, todayRange, weatherSummary } from '$lib/server/tools/weather';

export const weatherTool = tool({
	description:
		'Current weather + today\'s forecast for the family home. Use for "is it raining", "how hot today", "do I need a jacket".',
	inputSchema: z.object({}),
	execute: async () => {
		const w = await getWeather();
		const range = todayRange(w.hourly);
		return {
			summary: weatherSummary(w),
			tempC: Math.round(w.tempC),
			feelsLikeC: Math.round(w.feelsLikeC),
			condition: w.condition,
			todayMinC: range ? Math.round(range.minC) : null,
			todayMaxC: range ? Math.round(range.maxC) : null
		};
	}
});
