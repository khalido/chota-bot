/**
 * POST /tv/probe — what the TV page reports during the first Cast test: the
 * screen it got, and each remote key. Logged only, so the test can be watched
 * from the Pi's log without standing at the TV. Open on the home network like
 * the rest of /tv; it stores nothing and does nothing else.
 */
import { json } from '@sveltejs/kit';
import { log } from '#lib/server/log.ts';

const MAX_BYTES = 2_000;

export async function POST({ request }) {
	const text = (await request.text()).slice(0, MAX_BYTES);
	log('tv', `probe ${text}`);
	return json({ ok: true });
}
