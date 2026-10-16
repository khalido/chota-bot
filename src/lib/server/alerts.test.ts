import { beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '$lib/server/db/schema';

const sqlite = new Database(':memory:');
sqlite.exec(`CREATE TABLE alert (
	key text PRIMARY KEY NOT NULL, status text NOT NULL, text text NOT NULL,
	opened_at integer NOT NULL, sent_at integer, ok_streak integer DEFAULT 0 NOT NULL,
	resolved_at integer)`);
vi.mock('$lib/server/db', () => ({ db: drizzle(sqlite, { schema }) }));
vi.mock('$lib/server/config', () => ({
	getConfig: () => ({
		channels: { default: 'telegram', fallback: 'whatsapp' },
		alerts: { quietHours: { from: '21:00', to: '07:00' } }
	})
}));
vi.mock('$lib/server/log', () => ({ log: vi.fn(), logErr: vi.fn() }));

const { clearAlert, inQuietHours, raiseAlert, registerAlertChannel } = await import('./alerts');

const sent: { text: string; silent: boolean }[] = [];
let telegramDown = false;
const viaWhatsapp: string[] = [];
registerAlertChannel('telegram', async (text, { silent }) => {
	if (telegramDown) throw new Error('telegram down');
	sent.push({ text, silent });
});
registerAlertChannel('whatsapp', async (text) => {
	viaWhatsapp.push(text);
});

const at = (iso: string) => new Date(iso);

beforeEach(() => {
	sqlite.exec('DELETE FROM alert');
	sent.length = 0;
	viaWhatsapp.length = 0;
	telegramDown = false;
});

describe('raiseAlert / clearAlert', () => {
	it('sends a problem once, repeats only after 12h, and says when it is fixed', async () => {
		await raiseAlert('printer', 'Printer: paper out', at('2026-10-16T10:00:00+11:00'));
		await raiseAlert('printer', 'Printer: paper out', at('2026-10-16T10:30:00+11:00'));
		expect(sent.map((s) => s.text)).toEqual(['⚠️ Printer: paper out']);

		await raiseAlert('printer', 'Printer: paper out', at('2026-10-16T22:01:00+11:00'));
		expect(sent.at(-1)).toEqual({ text: '⚠️ Still: Printer: paper out', silent: true });

		await clearAlert('printer', {}, at('2026-10-17T08:00:00+11:00'));
		expect(sent.at(-1)?.text).toBe('✅ Back to normal: Printer: paper out');
		await clearAlert('printer');
		expect(sent).toHaveLength(3);
	});

	it('needs okNeeded good checks in a row to close', async () => {
		await raiseAlert('printer', 'Printer: cover open');
		await clearAlert('printer', { okNeeded: 2 });
		expect(sent).toHaveLength(1);
		await raiseAlert('printer', 'Printer: cover open'); // flapped — streak resets
		await clearAlert('printer', { okNeeded: 2 });
		await clearAlert('printer', { okNeeded: 2, recovered: 'Printer OK' });
		expect(sent.map((s) => s.text)).toEqual(['⚠️ Printer: cover open', '✅ Printer OK']);
	});

	it('falls back to the fallback channel when the default fails', async () => {
		telegramDown = true;
		expect(await raiseAlert('printer', 'Printer: paper out')).toBe(true);
		expect(viaWhatsapp).toEqual(['⚠️ Printer: paper out']);
	});

	it('clearing something never raised sends nothing', async () => {
		await clearAlert('job:heartbeat');
		expect(sent).toEqual([]);
	});
});

describe('inQuietHours', () => {
	const quiet = { from: '21:00', to: '07:00' };
	it('wraps midnight', () => {
		expect(inQuietHours('23:30', quiet)).toBe(true);
		expect(inQuietHours('06:59', quiet)).toBe(true);
		expect(inQuietHours('07:00', quiet)).toBe(false);
		expect(inQuietHours('12:00', quiet)).toBe(false);
		expect(inQuietHours('12:00')).toBe(false);
		expect(inQuietHours('13:00', { from: '12:00', to: '14:00' })).toBe(true);
	});
});
