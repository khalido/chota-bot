import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/static/private', () => ({ TICKTICK_API_KEY: 'test' }));
vi.mock('$lib/server/config', () => ({ getConfig: () => ({}) }));

const { dueDateString, matchTitles } = await import('./ticktick');

describe('dueDateString', () => {
	it('uses the offset at Sydney midnight', () => {
		expect(dueDateString('2026-11-15')).toBe('2026-11-15T00:00:00.000+1100');
		expect(dueDateString('2026-06-15')).toBe('2026-06-15T00:00:00.000+1000');
	});

	it('gets DST change days right (midnight is before the switch)', () => {
		// DST starts 2026-10-04 at 02:00: midnight is still AEST.
		expect(dueDateString('2026-10-04')).toBe('2026-10-04T00:00:00.000+1000');
		// DST ends 2026-04-05 at 03:00: midnight is still AEDT.
		expect(dueDateString('2026-04-05')).toBe('2026-04-05T00:00:00.000+1100');
	});
});

describe('matchTitles', () => {
	const task = (title: string) => ({ id: title, projectId: 'p', title, status: 0, priority: 0 });
	const tasks = [task('Milk'), task('Oat milk'), task('Spring onions'), task('Kid1 school shoes')];

	it('prefers an exact title, ignoring case and spacing', () => {
		const r = matchTitles(tasks, ['  milk ']);
		expect(r.found.map((f) => f.task.title)).toEqual(['Milk']);
	});

	it('falls back to a single partial match', () => {
		const r = matchTitles(tasks, ['onions', 'shoes']);
		expect(r.found.map((f) => f.task.title)).toEqual(['Spring onions', 'Kid1 school shoes']);
	});

	it('never guesses between several partial matches, and reports misses', () => {
		const r = matchTitles([task('Oat milk'), task('Almond milk')], ['milk', 'bread']);
		expect(r.found).toEqual([]);
		expect(r.ambiguous).toEqual([{ asked: 'milk', candidates: ['Oat milk', 'Almond milk'] }]);
		expect(r.notFound).toEqual(['bread']);
	});

	it('matches whole words only, and finds a task asked for twice once', () => {
		const r = matchTitles([task('Steak'), task('Shampoo')], ['tea', 'ham']);
		expect(r.found).toEqual([]);
		expect(r.notFound).toEqual(['tea', 'ham']);
		const twice = matchTitles(tasks, ['shoes', 'school shoes']);
		expect(twice.found.map((f) => f.task.title)).toEqual(['Kid1 school shoes']);
	});
});
