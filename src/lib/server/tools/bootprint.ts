/**
 * bootprint.space — a tiny "picture + fact" API for planets/moons/etc.
 *   GET https://api.bootprint.space/all/<object>   (object: earth, moon, …)
 *   → { object, image, image_id, fact, fact_id }
 * No key. Used (experimentally) for the brief's "DID YOU KNOW" block.
 */
import { log } from '#lib/server/log.ts';
import { fetchJson } from './http';

const BASE = 'https://api.bootprint.space/all';

export interface BootprintFact {
	object: string;
	/** PNG URL on cdn.bootprint.space. */
	image: string;
	fact: string;
}

interface BootprintResponse {
	object?: string;
	image?: string;
	fact?: string;
}

/** Fetch a picture + fact for `object` (default "earth"). Throws on network/HTTP error. */
export async function getBootprintFact(object = 'earth'): Promise<BootprintFact> {
	const d = await fetchJson<BootprintResponse>(`${BASE}/${encodeURIComponent(object)}`, {
		label: 'bootprint',
		timeoutMs: 8000
	});
	if (!d.fact) throw new Error('bootprint: no fact in response');
	log('bootprint', `${d.object ?? object}: ${d.fact.slice(0, 60)}…`);
	return { object: d.object ?? object, image: d.image ?? '', fact: d.fact };
}
