import { describe, expect, it, vi } from 'vitest';
import type { BookHit } from './types';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/config', () => ({ getConfig: () => ({}) }));
vi.mock('$lib/server/log', () => ({ log: vi.fn(), logErr: vi.fn() }));

const { holdings, matchLibrary, nearbyCopies, pickBook } = await import('./index');
const { parseAvailability, parseTitles } = await import('./library');

const hit = (title: string, authors: string[], extra: Partial<BookHit> = {}): BookHit => ({
	source: 'google',
	title,
	authors,
	year: 2012,
	pages: null,
	categories: [],
	description: '',
	isbn13: null,
	coverUrl: null,
	link: '',
	...extra
});

describe('pickBook', () => {
	it('skips study guides and prefers the title and author the query names', () => {
		const hits = [
			hit('Wonder - Literature Kit Gr. 5-6', ['Marita Cockburn']),
			hit('101 Books to Read Before You Grow Up', ['Bianca Schulze']),
			hit('Wonder', ['R. J. Palacio'], { pages: 324, description: 'Auggie…' })
		];
		expect(pickBook('wonder palacio', hits)?.authors).toEqual(['R. J. Palacio']);
	});

	it('collapses duplicate editions to the fullest one', () => {
		const thin = hit('Palestine', ['Rashid I. Khalidi'], { pages: null });
		const full = hit('Palestine', ['Rashid I. Khalidi'], {
			pages: 139,
			description: 'x',
			isbn13: '978'
		});
		expect(pickBook('palestine khalidi', [thin, full])).toBe(full);
		expect(pickBook('x', [])).toBeNull();
	});
});

describe('library parsing', () => {
	it('reads copies on the shelf, or the total when none are', () => {
		expect(
			parseAvailability(
				'2 Items available. Surry Hills Library  792.92 / HARR, Ultimo Library  792.92 / HARR'
			)
		).toEqual({
			available: 2,
			copies: [
				{ branch: 'Surry Hills Library', callNumber: '792.92 / HARR' },
				{ branch: 'Ultimo Library', callNumber: '792.92 / HARR' }
			],
			total: null
		});
		expect(parseAvailability('0 Items available. (Total items: 5)')).toEqual({
			available: 0,
			copies: [],
			total: 5
		});
	});

	it('parses the GetTitlesAll DataSet', () => {
		const xml = `<NewDataSet><Access>
			<dds_bibusri>R0000411101</dds_bibusri>
			<dds_title>Wonder / R.J. Palacio.</dds_title>
			<dds_author>Palacio, R. J.</dds_author>
			<dds_pdate>2012</dds_pdate>
			<dds_isbn13>9780552565974</dds_isbn13>
			<dds_formatgrp>BK</dds_formatgrp>
			<dds_audience>Juvenile</dds_audience>
			<dds_audiencenote>Audience: 9+ years old.</dds_audiencenote>
			<dds_notbookable>false</dds_notbookable>
			<CopyAvailability>1 Items available. Green Square Library  J FICTION / PALA</CopyAvailability>
			<CountOfReservesActiveThisTitle>0</CountOfReservesActiveThisTitle>
		</Access></NewDataSet>`;
		const [t] = parseTitles(xml);
		expect(t).toMatchObject({
			id: 'R0000411101',
			title: 'Wonder',
			year: 2012,
			audienceNote: 'Audience: 9+ years old.',
			available: 1,
			copies: [{ branch: 'Green Square Library', callNumber: 'J FICTION / PALA' }],
			reservable: true
		});
		const book = hit('Wonder', ['R. J. Palacio']);
		expect(matchLibrary(book, [t])).toHaveLength(1);
		const sequel = { ...t, id: 'R2', title: 'Wonder: the sequel', available: 3 };
		expect(matchLibrary(book, [sequel, t]).map((x) => x.id)).toEqual(['R0000411101', 'R2']);
		expect(nearbyCopies([t], ['Green Square'])).toHaveLength(1);
		expect(nearbyCopies([t], ['Ultimo', 'Darling Square'])).toEqual([]);
	});
});

describe('holdings', () => {
	const rec = (format: string, text: string, reserves = 0) => ({
		id: format,
		title: 'x',
		author: 'y',
		year: null,
		isbn13: null,
		series: null,
		format,
		audience: null,
		audienceNote: null,
		...parseAvailability(text),
		reserves,
		reservable: true
	});

	it('counts print books only, and a total only when every record has one', () => {
		const onShelf = rec('BK', '1 Items available. Ultimo Library  J PALA');
		const out = rec('BK', '0 Items available. (Total items: 5)', 2);
		const audio = rec('AB', '3 Items available. Glebe Library  CD');
		expect(holdings([onShelf, out, audio])).toEqual({
			onShelf: 1,
			total: null,
			waiting: 2,
			branches: ['Ultimo Library']
		});
		expect(holdings([out]).total).toBe(5);
		expect(holdings([audio]).onShelf).toBe(3);
	});

	it('matches a title with or without accents', () => {
		const lib = {
			...rec('BK', '0 Items available. (Total items: 1)'),
			title: 'Amelie',
			author: 'Dupont, Jean'
		};
		expect(matchLibrary(hit('Amélie', ['Jean Dupont']), [lib])).toHaveLength(1);
	});
});
