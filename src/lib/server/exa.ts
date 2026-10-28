/**
 * The one Exa client (search and page contents), shared by the book lookup
 * and saved content. Key: EXA_API_KEY.
 */
import Exa from 'exa-js';
import { env } from '$env/dynamic/private';

let client: Exa | undefined;

export function exa(): Exa {
	if (!env.EXA_API_KEY) throw new Error('Set EXA_API_KEY in .env');
	client ??= new Exa(env.EXA_API_KEY);
	return client;
}
