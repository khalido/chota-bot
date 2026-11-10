import { pingTickTick } from '#lib/server/tools/ticktick.ts';
import type { RequestHandler } from './$types';

/** GET /api/ticktick/ping → { ok, ms, projects?, error? } — spot-check the hosted MCP. */
export const GET: RequestHandler = async () => Response.json(await pingTickTick());
