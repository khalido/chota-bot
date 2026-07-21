/**
 * weather agent-tool — sky + sea: current conditions + today's headline for
 * home, plus the local beach's full lifeguard report.
 *
 * Wraps `$lib/server/tools/weather` (+ `beach`). No args: location + beach come
 * from `chota.config.ts > home`. The full hourly array is dropped, but — unlike
 * the print's one-liner — the LLM gets the FULL beach report (water temp, wave
 * height, rips, bluebottles, status, when updated) so it can answer specifics
 * like "how cold's the water?" or "any bluebottles at Coogee?". `beach` is null
 * when no beach is configured or the feed is down.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { getWeather, todayRange, weatherSummary } from '$lib/server/tools/weather';
import { getBeachReport, beachSummary } from '$lib/server/tools/beach';

export const weatherTool = tool({
	description:
		'Current weather + today\'s forecast for the family home, plus the local beach surf report (water temp, waves, rips, bluebottles, status). Use for "is it raining", "how hot today", "do I need a jacket", "how\'s the beach", "how cold is the water", "is it good for beach volleyball".',
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
			beach: beach
				? {
						name: beach.beach,
						summary: beach.summary,
						line: beachSummary(beach),
						waterTempC: beach.waterTempC,
						waveHeight: beach.waveHeight,
						status: beach.status,
						rips: beach.rips,
						bluebottles: beach.bluebottles,
						description: beach.description,
						updated: beach.updated ? beach.updated.toISOString() : null
					}
				: null
		};
	}
});
