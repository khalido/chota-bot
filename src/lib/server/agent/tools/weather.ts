/**
 * weather agent-tool — current conditions + today's headline for home, plus
 * the local beach's lifeguard report.
 *
 * Wraps `$lib/server/tools/weather` (+ `beach`). No args: location + beach come
 * from `chota.config.ts > home`. Returns a small scalar shape — the full hourly
 * array is dropped; the LLM gets `summary` (the same one-liner the kiosk shows)
 * plus today's min/max so it can answer "should I take a jacket?". `beach` is
 * always included (the kids play beach volleyball) — null when no beach is
 * configured or the feed is down.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getWeather, todayRange, weatherSummary } from '$lib/server/tools/weather';
import { getBeachReport, beachSummary } from '$lib/server/tools/beach';

export const weatherTool = tool({
	description:
		'Current weather + today\'s forecast for the family home, plus the local beach surf report (water temp, waves, rips, status). Use for "is it raining", "how hot today", "do I need a jacket", "how\'s the beach", "is it good for beach volleyball".',
	inputSchema: z.object({}),
	execute: async () => {
		const [w, beach] = await Promise.all([getWeather(), getBeachReport().catch(() => null)]);
		const range = todayRange(w.hourly);
		return {
			summary: weatherSummary(w),
			tempC: Math.round(w.tempC),
			feelsLikeC: Math.round(w.feelsLikeC),
			condition: w.condition,
			todayMinC: range ? Math.round(range.minC) : null,
			todayMaxC: range ? Math.round(range.maxC) : null,
			beach: beach ? beachSummary(beach) : null
		};
	}
});
