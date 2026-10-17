/**
 * City of Sydney Library catalogue (Infor Montage) — what the library holds,
 * which branches have a copy on the shelf now, and its own audience note
 * ("Audience: 9+ years old").
 *
 * No published API: the catalogue page loads its results from a JSON web
 * method, `webmethods.aspx/GetTitlesAll`, which answers a plain POST — no
 * session, no browser. The reply is `{ d: "<NewDataSet>…" }`, an XML
 * DataSet, one `<Access>` per title. Keywords match whole words
 * ("philosopher's", not "philosopher"), so search with an exact title.
 * `c` is the page size. Reserving needs the member login (not built).
 */
import * as cheerio from 'cheerio';

const BASE = 'https://library.cityofsydney.nsw.gov.au/Montage';
const PAGE_SIZE = 6;

export interface LibraryCopy {
	/** "Green Square Library" */
	branch: string;
	/** Shelf location, "J FICTION / PALA". */
	callNumber: string;
}

export interface LibraryTitle {
	/** Catalogue record id, "R0000411101". */
	id: string;
	title: string;
	author: string;
	year: number | null;
	isbn13: string | null;
	series: string | null;
	/** Montage format group: BK book; others are DVDs, audiobooks, e-books… */
	format: string;
	/** "Juvenile", "Secondary  (senior high)", … */
	audience: string | null;
	/** The library's own age note: "Audience: 9+ years old." */
	audienceNote: string | null;
	/** Copies on the shelf now, and where. */
	available: number;
	copies: LibraryCopy[];
	/** All copies, when none are on the shelf ("(Total items: 5)"). */
	total: number | null;
	/** People waiting on a reserve. */
	reserves: number;
	reservable: boolean;
}

/** The catalogue's own results page for a search — the link to send. */
export const librarySearchUrl = (keyword: string) =>
	`${BASE}/All.aspx?${new URLSearchParams({ keyword })}`;

export async function searchLibrary(keyword: string): Promise<LibraryTitle[]> {
	const res = await fetch(`${BASE}/webmethods.aspx/GetTitlesAll`, {
		method: 'POST',
		headers: { 'content-type': 'application/json; charset=utf-8' },
		body: JSON.stringify({
			pageIndex: 1,
			keyword,
			method: '0',
			collection: '',
			refinements: '',
			datefrom: '',
			dateto: '',
			page: 'Books.aspx',
			sort: '1003',
			bibid: '',
			c: PAGE_SIZE,
			showall: 0,
			stats: 0,
			listid: '',
			frm: ''
		}),
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new Error(`Library catalogue ${res.status}`);
	const { d } = (await res.json()) as { d?: string };
	return d ? parseTitles(d) : [];
}

/** The `<NewDataSet>` reply → titles. Exported for tests. */
export function parseTitles(xml: string): LibraryTitle[] {
	const $ = cheerio.load(xml, { xml: true });
	return $('Access')
		.toArray()
		.map((el) => {
			const get = (tag: string) => $(el).children(tag).first().text().trim() || null;
			const availability = parseAvailability(get('CopyAvailability') ?? '');
			return {
				id: get('dds_bibusri') ?? '',
				title: cleanTitle(get('dds_title') ?? ''),
				author: get('dds_author') ?? '',
				year: Number(get('dds_pdate')) || null,
				isbn13: get('dds_isbn13'),
				series: get('dds_series'),
				format: get('dds_formatgrp') ?? '',
				audience: get('dds_audience'),
				audienceNote: get('dds_audiencenote'),
				...availability,
				reserves: Number(get('CountOfReservesActiveThisTitle')) || 0,
				reservable: get('dds_notbookable') !== 'true'
			};
		});
}

/**
 * "2 Items available. Surry Hills Library  792.92 / HARR, Ultimo Library  792.92 / HARR"
 * "0 Items available. (Total items: 5)"
 */
export function parseAvailability(text: string): {
	available: number;
	copies: LibraryCopy[];
	total: number | null;
} {
	const available = Number(text.match(/^(\d+) Items? available/)?.[1] ?? 0);
	const total = text.match(/\(Total items: (\d+)\)/);
	const rest = text.replace(/^\d+ Items? available\.\s*/, '');
	const copies = total
		? []
		: rest
				.split(/,\s+(?=[^,]*Library\s)/)
				.map((part) => part.match(/^(.*?Library)\s+(.*)$/))
				.filter((m) => m !== null)
				.map((m) => ({ branch: m[1].trim(), callNumber: m[2].trim() }));
	return { available, copies, total: total ? Number(total[1]) : null };
}

/** "White bird : a wonder story / written and illustrated by …" → "White bird: a wonder story" */
const cleanTitle = (t: string) =>
	t
		.split(' / ')[0]
		.replace(/\s+:\s*/g, ': ')
		.replace(/[.\s]+$/, '')
		.trim();
