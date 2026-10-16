import { describe, expect, it } from 'vitest';
import { toWhatsApp } from './whatsapp-format';

describe('toWhatsApp', () => {
	it('converts bold, headings, strike, lists and links', () => {
		const md = [
			'## This weekend',
			'- **Sat** volleyball at [Tempe](https://maps.example/t)',
			'* ~~Sun~~ nothing',
			'See https://example.com'
		].join('\n');
		expect(toWhatsApp(md)).toBe(
			[
				'*This weekend*',
				'• *Sat* volleyball at Tempe [1]',
				'• ~Sun~ nothing',
				'See https://example.com',
				'',
				'[1] https://maps.example/t'
			].join('\n')
		);
	});

	it('leaves single-asterisk and underscore emphasis alone', () => {
		expect(toWhatsApp('a *b* _c_')).toBe('a *b* _c_');
	});

	it('numbers distinct links once, reusing a number for a repeat', () => {
		expect(toWhatsApp('[a](https://a.io) [b](https://b.io) [again](https://a.io)')).toBe(
			'a [1] b [2] again [1]\n\n[1] https://a.io\n[2] https://b.io'
		);
	});

	it('keeps brackets inside a url', () => {
		expect(toWhatsApp('see [Foo](https://w.org/Foo_(film)).')).toBe(
			'see Foo [1].\n\n[1] https://w.org/Foo_(film)'
		);
	});

	it('collapses a link whose text is its url', () => {
		expect(toWhatsApp('[https://x.io](https://x.io)')).toBe('https://x.io');
	});
});
