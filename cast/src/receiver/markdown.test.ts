import { describe, expect, it } from 'vitest';
import { markdown } from './markdown.ts';

describe('markdown', () => {
	it('reads headings, paragraphs, bullets and inline marks', () => {
		expect(markdown('# Hi\n\nOne **two**\nthree *four* `five`\n\n- a\n- b')).toEqual([
			{ kind: 'heading', spans: [{ kind: 'text', text: 'Hi' }] },
			{
				kind: 'para',
				spans: [
					{ kind: 'text', text: 'One ' },
					{ kind: 'bold', text: 'two' },
					{ kind: 'text', text: ' three ' },
					{ kind: 'italic', text: 'four' },
					{ kind: 'text', text: ' ' },
					{ kind: 'code', text: 'five' }
				]
			},
			{ kind: 'bullets', items: [[{ kind: 'text', text: 'a' }], [{ kind: 'text', text: 'b' }]] }
		]);
	});

	it('keeps HTML as text', () => {
		expect(markdown('<img src=x onerror=alert(1)>')).toEqual([
			{ kind: 'para', spans: [{ kind: 'text', text: '<img src=x onerror=alert(1)>' }] }
		]);
	});
});
