import { json } from '@sveltejs/kit';
import { pingTickTick } from '$lib/server/tools/ticktick';
import type { RequestHandler } from './$types';

/** GET /api/ticktick/ping → { ok, ms, projects?, error? } — spot-check the hosted MCP. */
export const GET: RequestHandler = async () => json(await pingTickTick());
