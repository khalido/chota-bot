import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/static/private', () => ({ TICKTICK_API_KEY: 'test' }));
vi.mock('$lib/server/config', () => ({ getConfig: () => ({}) }));

const { dueDateString } = await import('./ticktick');

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
