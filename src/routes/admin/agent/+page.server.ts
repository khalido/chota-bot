/**
 * /admin/agent — server load for the streaming chat dev surface.
 *
 * Just metadata: which model the agent uses, the tool registry derived
 * from `chotaAgent.tools` (so this stays in lockstep with index.ts), and
 * an env-health snapshot per integration. The actual chat traffic flows
 * through POST /api/agent/chat as a UI-message stream.
 */
import { eq } from 'drizzle-orm';
import { chotaAgent, MODEL } from '#lib/server/agent/index.ts';
import { getConfig } from '#lib/server/config.ts';
import { db } from '#lib/server/db/index.ts';
import { account } from '#lib/server/db/auth.schema.ts';

import {
	AI_GATEWAY_API_KEY,
	GOOGLE_WEATHER_API_KEY,
	TICKTICK_API_KEY,
	TMDB_READ_ACCESS_TOKEN,
	GOOGLE_BOOKS_API_KEY,
	EXA_API_KEY
} from '$app/env/private';

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const tools = Object.entries(chotaAgent.tools).map(([name, t]) => {
		const schema = (t as { inputSchema?: { shape?: Record<string, unknown> } }).inputSchema;
		const fields = schema?.shape ? Object.keys(schema.shape) : [];
		return {
			name,
			description: (t as { description?: string }).description ?? '',
			fields
		};
	});

	const cfg = getConfig();
	const googleAccount = await db
		.select({ id: account.userId })
		.from(account)
		.where(eq(account.providerId, 'google'))
		.limit(1);

	const health = {
		aiGateway: !!AI_GATEWAY_API_KEY,
		weather: !!GOOGLE_WEATHER_API_KEY,
		calendar: googleAccount.length > 0 && !!cfg.calendar?.id,
		ticktick: !!TICKTICK_API_KEY && Object.keys(cfg.ticktick?.lists ?? {}).length > 0,
		tmdb: !!TMDB_READ_ACCESS_TOKEN,
		books: !!GOOGLE_BOOKS_API_KEY && !!EXA_API_KEY
	};

	return { model: MODEL, tools, health };
};
