import { describe, expect, it, vi } from 'vitest';
import type { Schemas } from '@xdevplatform/xdk';

vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$lib/server/log', () => import('$lib/server/log.mock'));
const { postId, linkedPostId, toPost } = await import('./x');

describe('postId', () => {
	it.each([
		['https://x.com/someone/status/2115623382721126826', '2115623382721126826'],
		['https://twitter.com/someone/status/42?s=20&t=abc', '42'],
		['https://mobile.twitter.com/someone/statuses/42', '42'],
		['https://x.com/i/status/42', '42'],
		['https://www.x.com/someone/status/42/photo/1', '42'],
		['42', '42']
	])('%s → %s', (ref, id) => expect(postId(ref)).toBe(id));

	it.each([
		'https://x.com/someone',
		'https://x.com/i/lists/204975651',
		'https://example.com/someone/status/42',
		'https://notx.com/a/status/42'
	])('%s is not a post', (ref) => expect(postId(ref)).toBeUndefined());

	it('a bare number is an id but not a link', () => {
		expect(linkedPostId('42')).toBeUndefined();
		expect(linkedPostId('https://x.com/a/status/42')).toBe('42');
	});
});

describe('toPost', () => {
	const users = [{ id: '7', username: 'someone', name: 'Some One' }];

	it('takes a long post’s full text, its outside links, and an X Article', () => {
		const p = {
			id: '42',
			authorId: '7',
			text: 'short…',
			createdAt: '2026-10-29T01:54:55.000Z',
			notePost: {
				text: 'the whole long post',
				entities: {
					urls: [
						{ start: 0, end: 1, expandedUrl: 'https://example.com/a' },
						{ start: 0, end: 1, expandedUrl: 'https://x.com/i/article/9' },
						{ start: 0, end: 1, expandedUrl: 'https://pic.twimg.com/b.jpg' },
						{ start: 0, end: 1, expandedUrl: 'https://example.com/a' }
					]
				}
			},
			article: { title: 'An essay', plainText: 'Article body' },
			publicMetrics: { likeCount: 3, repostCount: 1 }
		} as unknown as Schemas.Post;
		expect(toPost(p, users)).toEqual({
			id: '42',
			text: 'the whole long post',
			author: 'someone',
			authorName: 'Some One',
			createdAt: '2026-10-29T01:54:55.000Z',
			url: 'https://x.com/someone/status/42',
			links: ['https://example.com/a'],
			article: { title: 'An essay', text: 'Article body' },
			likes: 3,
			reposts: 1
		});
	});

	it('an unknown author still gives a link that opens', () => {
		const post = toPost({ id: '42', text: 'hi' } as Schemas.Post, undefined);
		expect(post.author).toBe('i');
		expect(post.url).toBe('https://x.com/i/status/42');
		expect(post.article).toBeUndefined();
		expect(post.links).toEqual([]);
	});
});
