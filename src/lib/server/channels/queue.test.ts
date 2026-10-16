import { describe, expect, it } from 'vitest';
import { ThreadQueue } from './queue';

/** A handler whose turns finish only when released, recording what it saw. */
function harness() {
	const seen: { latest: string; skipped: string[] }[] = [];
	const releases: (() => void)[] = [];
	const q = new ThreadQueue<string>(
		(latest, skipped) =>
			new Promise<void>((resolve) => {
				seen.push({ latest, skipped });
				releases.push(resolve);
			})
	);
	const tick = () => new Promise((r) => setTimeout(r, 0));
	return { q, seen, release: () => releases.shift()?.(), tick };
}

describe('ThreadQueue', () => {
	it('runs one turn per thread; a burst becomes one turn with the rest skipped', async () => {
		const { q, seen, release, tick } = harness();
		q.push('wa:group', 'milk');
		q.push('wa:group', 'and bread');
		q.push('wa:group', 'oh and eggs');
		await tick();
		expect(seen).toEqual([{ latest: 'milk', skipped: [] }]);

		release();
		await tick();
		expect(seen[1]).toEqual({ latest: 'oh and eggs', skipped: ['and bread'] });
		release();
		await tick();
		expect(seen).toHaveLength(2);
	});

	it('runs different threads in parallel', async () => {
		const { q, seen, tick } = harness();
		q.push('tg:1', 'a');
		q.push('wa:2', 'b');
		await tick();
		expect(seen.map((s) => s.latest)).toEqual(['a', 'b']);
	});

	it('a failing turn does not wedge the thread', async () => {
		let n = 0;
		const q = new ThreadQueue<string>(async () => {
			if (n++ === 0) throw new Error('boom');
		});
		await q.push('tg:1', 'first');
		await q.push('tg:1', 'second');
		expect(n).toBe(2);
	});
});
