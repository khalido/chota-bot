import { describe, expect, it } from 'vitest';
import { cleanLinks, cleanUrl } from './links';

describe('cleanUrl', () => {
	it('takes out analytics and click ids, keeping what the page needs', () => {
		expect(
			cleanUrl('https://example.com/story?id=7&utm_source=x&utm_medium=social&fbclid=abc&ref=hn')
		).toBe('https://example.com/story?id=7');
		expect(cleanUrl('https://www.google.com/search?q=sydney+buses&gclid=1')).toBe(
			'https://www.google.com/search?q=sydney+buses'
		);
	});

	it('drops the "?" when only tracking was there', () => {
		expect(cleanUrl('https://example.com/a?utm_source=x')).toBe('https://example.com/a');
	});

	it('takes out share ids on the sites that use them, and only there', () => {
		expect(cleanUrl('https://open.spotify.com/track/abc?si=123')).toBe(
			'https://open.spotify.com/track/abc'
		);
		expect(cleanUrl('https://www.youtube.com/watch?v=dQw&t=42&si=xyz&feature=share')).toBe(
			'https://www.youtube.com/watch?v=dQw&t=42'
		);
		expect(cleanUrl('https://x.com/someone/status/1?s=20&t=abc')).toBe(
			'https://x.com/someone/status/1'
		);
		expect(cleanUrl('https://example.com/page?s=2&t=3')).toBe('https://example.com/page?s=2&t=3');
	});

	it("cleans Amazon's path and tracking", () => {
		expect(
			cleanUrl(
				'https://www.amazon.com.au/dp/B0ABC/ref=sr_1_3?crid=1&keywords=lamp&qid=9&sr=8-3&th=1&psc=1'
			)
		).toBe('https://www.amazon.com.au/dp/B0ABC?th=1&psc=1');
		expect(cleanUrl('https://github.com/o/r/blob/x.ts?ref=v2')).toBe(
			'https://github.com/o/r/blob/x.ts?ref=v2'
		);
	});

	it('leaves a clean link exactly as it was, encoding and all', () => {
		const raw = 'https://en.wikipedia.org/wiki/Foo_(film)?a=b%20c';
		expect(cleanUrl(raw)).toBe(raw);
		expect(cleanUrl('not a link')).toBe('not a link');
		expect(cleanUrl('mailto:a@b.c?utm_source=x')).toBe('mailto:a@b.c?utm_source=x');
	});
});

describe('cleanLinks', () => {
	it('cleans markdown links and bare ones, and keeps the sentence', () => {
		expect(
			cleanLinks(
				'See [the story](https://example.com/s?utm_source=x) or https://example.com/t?fbclid=1.'
			)
		).toBe('See [the story](https://example.com/s) or https://example.com/t.');
	});
});
