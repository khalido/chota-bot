import { beforeEach, describe, expect, it, vi } from 'vitest';

const cfg: { speech?: Record<string, unknown> } = {};
vi.mock('#lib/server/config.ts', () => ({ getConfig: () => cfg }));
vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
vi.mock('#lib/server/speech.ts', () => ({
	MAX_CHARS: 400,
	SpeechRefused: class extends Error {},
	speak: vi.fn()
}));
vi.mock('#lib/server/tools/content.ts', async () => {
	const { z } = await import('zod');
	return { AskerSchema: z.any() };
});

const { announceTool, refuse } = await import('./speech');
const { speak } = await import('#lib/server/speech.ts');

const asker = (sender: string | null, extra: object = {}) => ({
	sender,
	isDM: true,
	channel: 'whatsapp',
	threadId: 't',
	messageId: 'm',
	...extra
});

beforeEach(() => {
	cfg.speech = { model: 'm', volume: 0.5, announcers: ['Parent1'], perHour: 2 };
});

describe('announce: who may', () => {
	it('needs speech set up and a known sender', () => {
		delete cfg.speech;
		expect(refuse(asker('Parent1'))).toMatch(/not set up/);
		cfg.speech = { model: 'm', volume: 0.5 };
		expect(refuse(asker(null))).toMatch(/who's asking/);
		expect(refuse(undefined)).toMatch(/who's asking/);
	});
	it('only announcers, when the list is set, and never on a quiet turn', () => {
		expect(refuse(asker('Kid1'))).toMatch(/ask a parent/);
		expect(refuse(asker('Parent1', { quiet: true }))).toMatch(/only when/);
		expect(refuse(asker('Parent1'))).toBeUndefined();
		cfg.speech = { model: 'm', volume: 0.5 };
		expect(refuse(asker('Kid1'))).toBeUndefined();
	});
});

describe('the hourly cap', () => {
	const say = () =>
		announceTool.execute!({ text: 'hello' }, {
			context: { asker: asker('Parent1') }
		} as never) as Promise<{ said: boolean; reason?: string }>;

	it('counts only announcements that played', async () => {
		cfg.speech = { model: 'm', volume: 0.5, perHour: 1 };
		vi.mocked(speak).mockRejectedValueOnce(new Error('pw-play failed'));
		expect((await say()).said).toBe(false);
		vi.mocked(speak).mockResolvedValueOnce({ path: 'x', cached: false } as never);
		expect((await say()).said).toBe(true);
		expect(await say()).toMatchObject({ said: false, reason: expect.stringMatching(/enough/) });
	});
});

describe('important', () => {
	const say = (input: { text: string; important?: boolean }) =>
		announceTool.execute!(input, { context: { asker: asker('Parent1') } } as never);

	it('is passed to speak only when asked for, and echoed in the result', async () => {
		cfg.speech = { model: 'm', volume: 0.5, perHour: 10 };
		vi.mocked(speak).mockResolvedValue({ cached: false, ms: 1 });
		expect(await say({ text: 'dinner' })).toEqual({ said: true, text: 'dinner' });
		expect(vi.mocked(speak)).toHaveBeenLastCalledWith('dinner', {
			mood: undefined,
			important: undefined
		});
		expect(await say({ text: 'smoke alarm', important: true })).toMatchObject({
			said: true,
			important: true
		});
		expect(vi.mocked(speak)).toHaveBeenLastCalledWith('smoke alarm', {
			mood: undefined,
			important: true
		});
	});
});
