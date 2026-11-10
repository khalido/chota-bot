/**
 * A silent `#lib/server/log.ts` for tests, so every test mocks the whole module
 * the same way (a partial mock breaks as soon as the code uses one more export):
 *
 *   vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
 */
import { vi } from 'vitest';
import type { Event } from './log';

export { errorMessage } from '#lib/utils.ts';

export const log = vi.fn();
export const logErr = vi.fn();
export const logger = () => ({
	debug: vi.fn(),
	info: vi.fn(),
	warn: vi.fn(),
	warning: vi.fn(),
	error: vi.fn()
});
export const event = (): Event => {
	const ev: Event = { set: () => ev, done: vi.fn(), fail: vi.fn() };
	return ev;
};
export const configureLogging = vi.fn();
export const shutdownLogging = vi.fn();
