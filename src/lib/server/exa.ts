/**
 * The one Exa client (search and page contents), shared by the book lookup
 * and saved content. Key: EXA_API_KEY.
 */
import Exa from 'exa-js';
import { EXA_API_KEY } from '$app/env/private';

let client: Exa | undefined;

export function exa(): Exa {
	if (!EXA_API_KEY) throw new Error('Set EXA_API_KEY in .env');
	client ??= new Exa(EXA_API_KEY);
	return client;
}
