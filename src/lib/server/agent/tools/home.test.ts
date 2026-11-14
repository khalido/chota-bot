import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
vi.mock('#lib/server/config.ts', () => ({
	isParent: (name: string) => name === 'Parent1'
}));

const power = vi.fn();
const mode = vi.fn();
let running = true;
const state = { on: true, mode: 'dry', roomC: 28, asOf: '2026-11-14T05:00:00Z' };
vi.mock('#lib/server/home.ts', () => ({
	getHome: () =>
		running
			? {
					home: {
						integration: (name: string) =>
							name === 'daikin' ? { client: { power, mode } } : undefined,
						part: (name: string) => (name === 'daikin' ? { state } : undefined)
					}
				}
			: null,
	houseNow: () =>
		running
			? { summary: 'AC on, dry. 27 °C outside.', windows: { advice: 'close', why: 'AC on' } }
			: null
}));

const { airconTool, homeStatusTool, refuseAc } = await import('./home');

const asker = (sender: string, extra: object = {}) => ({
	sender,
	isDM: true,
	channel: 'whatsapp' as const,
	threadId: 't',
	messageId: 'm',
	...extra
});
const run = (input: object, who?: ReturnType<typeof asker>) =>
	airconTool.execute!(input as never, { context: { asker: who } } as never);

beforeEach(() => {
	running = true;
	power.mockReset().mockResolvedValue({ state: { on: false }, confirmed: true });
	mode
		.mockReset()
		.mockResolvedValue({ state: { on: true, mode: 'cool', targetC: 25 }, confirmed: true });
	delete process.env.CHOTA_HOME_DRY_RUN;
});

describe('home_status', () => {
	it('gives the paragraph and the windows', async () => {
		expect(await homeStatusTool.execute!({}, {} as never)).toEqual({
			summary: 'AC on, dry. 27 °C outside.',
			windows: 'close',
			windowsWhy: 'AC on'
		});
	});

	it('says plainly when the house is not connected', async () => {
		running = false;
		expect(await homeStatusTool.execute!({}, {} as never)).toMatchObject({
			error: expect.any(String)
		});
	});
});

describe('aircon', () => {
	it('lets anyone read it', async () => {
		expect(await run({ action: 'status' }, asker('Kid1'))).toMatchObject({
			aircon: expect.stringContaining('dry')
		});
	});

	it('changes only for a parent, never on a quiet turn', async () => {
		expect(refuseAc(asker('Parent1'))).toBeUndefined();
		expect(refuseAc(asker('Kid1'))).toMatch(/parent/);
		expect(refuseAc(asker('Parent1', { quiet: true }))).toBeDefined();
		expect(refuseAc(undefined)).toBeDefined();
		expect(await run({ action: 'off' }, asker('Kid1'))).toMatchObject({
			error: expect.any(String)
		});
		expect(power).not.toHaveBeenCalled();
	});

	it('sets a mode and reports what the unit confirmed', async () => {
		const out = await run({ action: 'mode', mode: 'cool', targetC: 25 }, asker('Parent1'));
		expect(mode).toHaveBeenCalledWith('cool', 25, { dryRun: false });
		expect(out).toMatchObject({ confirmed: true, aircon: expect.stringContaining('cool') });
	});

	it('refuses a temperature for dry or fan before sending anything', async () => {
		expect(await run({ action: 'mode', mode: 'dry', targetC: 24 }, asker('Parent1'))).toMatchObject(
			{
				error: expect.stringContaining('dry')
			}
		);
		expect(mode).not.toHaveBeenCalled();
	});

	it('sends nothing in a dry run, and says so', async () => {
		process.env.CHOTA_HOME_DRY_RUN = 'true';
		const out = await run({ action: 'off' }, asker('Parent1'));
		expect(power).toHaveBeenCalledWith(false, { dryRun: true });
		expect(out).toMatchObject({ dryRun: true });
	});

	it('turns a failed write into an error, not a throw', async () => {
		power.mockRejectedValue(new Error('no answer'));
		expect(await run({ action: 'off' }, asker('Parent1'))).toMatchObject({
			error: expect.stringContaining('no answer')
		});
	});
});
