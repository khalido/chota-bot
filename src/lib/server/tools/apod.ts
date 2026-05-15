/**
 * NASA Astronomy Picture of the Day.
 *   GET https://api.nasa.gov/planetary/apod?api_key=<key>[&date=YYYY-MM-DD]
 *   → { title, date, explanation, url, hdurl?, media_type, copyright? }
 * Reads NASA_API_KEY from env; falls back to NASA's shared DEMO_KEY (low rate
 * limit — fine for a once-a-day pull). The picture itself dithers to mush on
 * thermal — the `explanation` text is the part worth printing.
 *
 * Not wired into a print section yet (the explanation is often several
 * paragraphs — needs a truncation pass first).
 */
import { env } from '$env/dynamic/private';
import { log } from '$lib/server/log';

const APOD_URL = 'https://api.nasa.gov/planetary/apod';

export interface Apod {
	title: string;
	date: string;
	explanation: string;
	/** Image URL — or a video embed URL when `mediaType === 'video'`. */
	url: string;
	hdurl?: string;
	mediaType: string;
	copyright?: string;
}

interface ApodResponse {
	title?: string;
	date?: string;
	explanation?: string;
	url?: string;
	hdurl?: string;
	media_type?: string;
	copyright?: string;
}

/** Today's (or `date`'s, YYYY-MM-DD) APOD. Throws on network/HTTP error. */
export async function getApod(date?: string): Promise<Apod> {
	const qs = new URLSearchParams({ api_key: env.NASA_API_KEY || 'DEMO_KEY' });
	if (date) qs.set('date', date);
	const res = await fetch(`${APOD_URL}?${qs}`, { signal: AbortSignal.timeout(10_000) });
	if (!res.ok) throw new Error(`NASA APOD ${res.status}: ${await res.text().catch(() => '')}`);
	const d = (await res.json()) as ApodResponse;
	log('apod', `${d.date ?? '?'}: ${d.title ?? '?'}`);
	return {
		title: d.title ?? 'Astronomy Picture of the Day',
		date: d.date ?? '',
		explanation: d.explanation ?? '',
		url: d.url ?? '',
		hdurl: d.hdurl,
		mediaType: d.media_type ?? 'image',
		copyright: d.copyright
	};
}
