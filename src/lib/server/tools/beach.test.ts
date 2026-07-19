import { describe, it, expect } from 'vitest';
import { parseBeachReport, beachSummary } from './beach';

// Trimmed real markup from the Randwick City Council lifeguard RSS feed —
// two beaches, each an <item> with a CDATA <description> of labelled fields.
const FEED = `<?xml version="1.0" ?>
<rss version="2.0"><channel><title>Randwick City Council Lifeguard Reports</title>
	<item>
		<title>Maroubra Beach</title>
		<pubDate>Sun, 19 Jul 2026 07:16:30 +1000</pubDate>
		<description><![CDATA[<p><strong>Summary:</strong> Beautiful day</p><p><strong>Water Temp:</strong> 17 C</p><p><strong>Wave Height:</strong> 1m</p><p><strong>Beach Status:</strong> Open</p><p><strong>Rips:</strong> Minimal</p><p><strong>Bluebottles:</strong> None sighted</p><p><strong>Description:</strong> Nice day.</p>]]></description>
	</item>
	<item>
		<title>Coogee Beach</title>
		<pubDate>Sun, 19 Jul 2026 07:12:47 +1000</pubDate>
		<description><![CDATA[<p><strong>Summary:</strong> Rough conditions</p><p><strong>Water Temp:</strong> 18 C</p><p><strong>Wave Height:</strong> 2m</p><p><strong>Beach Status:</strong> Open</p><p><strong>Rips:</strong> Be cautious</p><p><strong>Bluebottles:</strong> None sighted</p><p><strong>Description:</strong> Rough onshore conditions today</p>]]></description>
	</item>
</channel></rss>`;

describe('parseBeachReport', () => {
	it('parses the named beach out of the feed', () => {
		const r = parseBeachReport(FEED, 'Coogee')!;
		expect(r).toEqual({
			beach: 'Coogee Beach',
			updated: new Date('Sun, 19 Jul 2026 07:12:47 +1000'),
			summary: 'Rough conditions',
			waterTempC: 18,
			waveHeight: '2m',
			status: 'Open',
			rips: 'Be cautious',
			bluebottles: 'None sighted',
			description: 'Rough onshore conditions today'
		});
	});

	it('matches case-insensitively on a title substring', () => {
		expect(parseBeachReport(FEED, 'maroubra')?.summary).toBe('Beautiful day');
	});

	it('returns null when the beach is not in the feed', () => {
		expect(parseBeachReport(FEED, 'Bondi')).toBeNull();
	});
});

describe('beachSummary', () => {
	it('renders a compact conditions line and flags cautionary rips', () => {
		const r = parseBeachReport(FEED, 'Coogee')!;
		expect(beachSummary(r)).toBe(
			'Coogee: rough conditions, 18C water, 2m waves, open (rips: be cautious).'
		);
	});

	it('omits calm rips and unsighted bluebottles', () => {
		const r = parseBeachReport(FEED, 'Maroubra')!;
		expect(beachSummary(r)).toBe('Maroubra: beautiful day, 17C water, 1m waves, open.');
	});
});
