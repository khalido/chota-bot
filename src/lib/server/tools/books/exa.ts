/**
 * One Exa search per book for what the catalogues don't say: a short blurb,
 * an age guide from a review or the publisher, and how it was received.
 *
 * Exa's recommended request (exa-labs/agent-skills, build-with-exa) is the
 * query plus `contents: { highlights: true }`; we need specific fields, so
 * an `outputSchema` too, read from `output.content`. `numResults` is capped
 * at 5 to keep a lookup cheap. Key: EXA_API_KEY.
 */
import Exa from 'exa-js';
import { env } from '$env/dynamic/private';
import { log } from '$lib/server/log';

export interface BookBlurb {
	/** 1–3 sentences on what the book is about, no spoilers. */
	blurb: string;
	/** "9–12", "8+", or null when no source says. */
	ageGuide: string | null;
	/** One line: awards, bestseller, critics' view — or null. */
	reception: string | null;
	sources: { title: string; url: string }[];
	costUsd: number | null;
}

const SCHEMA = {
	type: 'object' as const,
	properties: {
		blurb: {
			type: 'string',
			description: 'What the book is about in 1–3 plain sentences, no spoilers.'
		},
		ageGuide: {
			type: 'string',
			description:
				"Suggested reader age as a source states it (e.g. '9–12', '8+'). Empty if no source gives one."
		},
		reception: {
			type: 'string',
			description:
				'One line on how it was received: awards, bestseller status, critics. Empty if unknown.'
		}
	},
	required: ['blurb']
};

let exa: Exa | undefined;

export async function bookBlurb(title: string, author?: string): Promise<BookBlurb> {
	if (!env.EXA_API_KEY) throw new Error('Set EXA_API_KEY in .env');
	exa ??= new Exa(env.EXA_API_KEY);
	const r = await exa.search(`${title}${author ? ` by ${author}` : ''} book review`, {
		type: 'auto',
		numResults: 5,
		contents: { highlights: true },
		systemPrompt:
			'About this one book only. Prefer the publisher, reputable reviews and children’s-book review sites.',
		outputSchema: SCHEMA
	});
	const out = (typeof r.output?.content === 'object' ? r.output.content : {}) as Record<
		string,
		string | undefined
	>;
	const costUsd = r.costDollars?.total ?? null;
	log('books', `exa "${title}" $${costUsd ?? '?'}`);
	return {
		blurb: out.blurb?.trim() ?? '',
		ageGuide: out.ageGuide?.trim() || null,
		reception: out.reception?.trim() || null,
		sources: r.results.slice(0, 3).map((x) => ({ title: x.title ?? x.url, url: x.url })),
		costUsd
	};
}
