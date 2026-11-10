import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
vi.mock('#lib/server/config.ts', () => ({ getConfig: () => ({}) }));
vi.mock('usb', () => ({ findByIds: vi.fn(), usb: { LIBUSB_TRANSFER_TIMED_OUT: 2 } }));

const { decodeStatus } = await import('./printer');

describe('decodeStatus', () => {
	it('reads the MUNBYN healthy reply (seen on the Pi) as ok', () => {
		expect(decodeStatus([0x16, 0x12, 0x12, 0x12])).toEqual({
			ok: true,
			problems: [],
			paperLow: false,
			raw: '0x16 0x12 0x12 0x12'
		});
	});

	it('reads the MUNBYN reply with the roll out (seen on the Pi) as paper out', () => {
		expect(decodeStatus([0x1e, 0x32, 0x12, 0x72]).problems).toEqual(['paper out']);
	});

	it('reads the MUNBYN reply with the cover open (seen on the Pi) as cover open only', () => {
		// The paper sensor reads empty whenever the cover is up, roll or no roll.
		expect(decodeStatus([0x1e, 0x36, 0x12, 0x72]).problems).toEqual(['cover open']);
	});

	it('names a cutter jam, and does not add a bare "error" beside it', () => {
		expect(decodeStatus([0x1e, 0x52, 0x1a, 0x12]).problems).toEqual(['cutter jammed']);
	});

	it('falls back to "offline" with the bytes when no cause bit is set', () => {
		expect(decodeStatus([0x1e, 0x12, 0x12, 0x12]).problems).toEqual([
			'offline (0x1e 0x12 0x12 0x12)'
		]);
	});

	it('flags a low roll without calling it a problem', () => {
		const s = decodeStatus([0x16, 0x12, 0x12, 0x1e]);
		expect(s.ok).toBe(true);
		expect(s.paperLow).toBe(true);
	});

	it('shows a byte it cannot read instead of guessing', () => {
		expect(decodeStatus([0x16, 0x00, 0x12, 0x12]).problems).toEqual([
			'status not understood (0x16 0x00 0x12 0x12)'
		]);
	});

	it('treats a missing reply as not understood', () => {
		const s = decodeStatus([0x16, undefined, 0x12, 0x12]);
		expect(s.ok).toBe(false);
		expect(s.raw).toBe('0x16 -- 0x12 0x12');
	});
});
