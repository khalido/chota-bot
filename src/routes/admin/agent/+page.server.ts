/**
 * /admin/agent — server load for the streaming chat dev surface.
 *
 * Just metadata: which model the agent uses, the tool registry derived
 * from `chotaAgent.tools` (so this stays in lockstep with index.ts), and
 * an env-health snapshot per integration. The actual chat traffic flows
 * through POST /api/agent/chat as a UI-message stream.
 */
import { eq } from 'drizzle-orm';
import { chotaAgent, MODEL } from '$lib/server/agent';
import { getConfig } from '$lib/server/config';
import { db } from '$lib/server/db';
import { account } from '$lib/server/db/auth.schema';
import { env } from '$env/dynamic/private';
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
		aiGateway: !!env.AI_GATEWAY_API_KEY,
		weather: !!env.GOOGLE_WEATHER_API_KEY,
		calendar: googleAccount.length > 0 && !!cfg.calendar?.id,
		ticktick: !!env.TICKTICK_API_KEY && Object.keys(cfg.ticktick?.lists ?? {}).length > 0,
		tmdb: !!env.TMDB_READ_ACCESS_TOKEN
	};

	return { model: MODEL, tools, health };
};
