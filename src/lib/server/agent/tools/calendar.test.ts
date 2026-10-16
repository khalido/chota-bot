import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/tools/calendar', () => ({}));
vi.mock('$lib/server/config', () => ({}));
vi.mock('$lib/server/people', () => ({}));
vi.mock('$lib/server/log', () => ({}));

const { mapsUrl } = await import('./calendar');

describe('mapsUrl', () => {
	it('encodes the location text as a Maps search', () => {
		expect(mapsUrl('Tempe Recreation Reserve, Holbeach Ave, Tempe NSW 2044')).toBe(
			'https://www.google.com/maps/search/?api=1&query=Tempe%20Recreation%20Reserve%2C%20Holbeach%20Ave%2C%20Tempe%20NSW%202044'
		);
		expect(mapsUrl('Court F-1 & Co')).toContain('query=Court%20F-1%20%26%20Co');
	});

	it('skips locations that are not places', () => {
		for (const l of [
			'https://zoom.us/j/123',
			'www.example.com',
			'Online',
			' TBC ',
			'Google Meet'
		]) {
			expect(mapsUrl(l)).toBeNull();
		}
	});
});
