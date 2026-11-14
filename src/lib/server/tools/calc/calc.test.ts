import { describe, expect, it, vi } from 'vitest';

vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));

const rates = vi.hoisted(() => ({ fail: false }));
vi.mock('./rates.ts', async (original) => ({
	...(await original<typeof import('./rates.ts')>()),
	getRates: async () => {
		if (rates.fail) throw new Error('fx down');
		return {
			value: {
				date: '2026-11-12',
				perUSD: { USD: 1, AUD: 1.5, EUR: 0.5, JPY: 150 },
				dates: { JPY: '2026-11-11' }
			},
			asOf: new Date(),
			stale: false
		};
	}
}));

const { calculate, timeIn } = await import('./index.ts');
const { parseRates } = await import('./rates.ts');

const answer = async (text: string) => (await calculate(text))?.answer;

describe('calculate', () => {
	it('does arithmetic, powers, functions', async () => {
		expect(await answer('2 + 3 * 4')).toBe('14');
		expect(await answer('2^10')).toBe('1,024');
		expect(await answer('sqrt(144) + 1')).toBe('13');
		expect(await answer('0.1 + 0.2')).toBe('0.3');
		expect(await answer('1,000 * 12')).toBe('12,000');
	});

	it('does percentages', async () => {
		expect(await answer('20% of 300')).toBe('60');
		expect(await answer('15% off 80')).toBe('68');
		expect(await answer('200 + 10%')).toBe('220');
	});

	it('converts units', async () => {
		expect(await answer('10 ft to m')).toBe('3.048 m');
		expect(await answer('3 days in hours')).toBe('72 hours');
		expect(await answer('60 mph to kph')).toMatch(/^96\.56\d* km\/h$/);
		expect(await answer('100 f to c')).toMatch(/^37\.7\d* °C$/);
	});

	it('converts currency at the cached rates, with the day', async () => {
		// 100 USD at 1.5 AUD per USD
		expect(await calculate('100 usd in aud')).toEqual({
			answer: '150.00 AUD',
			note: 'Rates of 12 Nov'
		});
		expect(await answer('€20 * 3')).toBe('60.00 EUR');
		// JPY's rate is a day older: the note says the oldest used.
		expect((await calculate('1 usd to jpy'))?.note).toBe('Rates of 11 Nov');
		expect(await answer('1000 jpy to aud')).toBe('10.00 AUD');
	});

	it('converts a bare amount to AUD, and leaves AUD alone', async () => {
		expect(await answer('44 usd')).toBe('66.00 AUD');
		expect(await answer('$10')).toBe('15.00 AUD');
		expect(await calculate('100 aud')).toBeNull();
	});

	it('is null when it is not a sum', async () => {
		for (const text of [
			'Spotify',
			'm',
			'h',
			'pi',
			'42',
			'5 m',
			'hello world',
			'',
			'2026-11-02',
			'9:30'
		])
			expect(await calculate(text), text).toBeNull();
		expect(await calculate('x'.repeat(300) + ' 1')).toBeNull();
		expect(await calculate('1/0')).toBeNull();
		expect(await calculate('import("fs") 1')).toBeNull();
		// Assignment can define a recursive function that blocks the process for hours.
		const started = Date.now();
		expect(await calculate('f(n)=and(n>0, f(n-1)+f(n-1)); f(30)')).toBeNull();
		expect(await calculate('x = 5')).toBeNull();
		expect(Date.now() - started).toBeLessThan(500);
	});
});

describe('calculate without rates', () => {
	it('says so for money, and still does the rest', async () => {
		// A fresh module: nothing applied yet, and the fetch fails.
		vi.resetModules();
		rates.fail = true;
		const fresh = await import('./index.ts');
		const money = await fresh.calculate('100 usd in aud');
		expect(money?.answer).toBe('');
		expect(money?.note).toMatch(/rates are unavailable/i);
		expect((await fresh.calculate('2 + 2'))?.answer).toBe('4');
		expect((await fresh.calculate('10 ft to m'))?.answer).toBe('3.048 m');
		expect(await fresh.calculate('Spotify')).toBeNull();
		rates.fail = false;
	});
});

describe('parseRates', () => {
	it('keeps good rows, drops bad ones, and notes older days', () => {
		const parsed = parseRates([
			{ date: '2026-11-12', base: 'USD', quote: 'AUD', rate: 1.5 },
			{ date: '2026-11-11', base: 'USD', quote: 'JPY', rate: 150 },
			{ date: '2026-11-12', base: 'USD', quote: 'BAD1', rate: 3 },
			{ date: '2026-11-12', base: 'USD', quote: 'XXX', rate: -1 }
		]);
		expect(parsed).toEqual({
			date: '2026-11-12',
			perUSD: { USD: 1, AUD: 1.5, JPY: 150 },
			dates: { JPY: '2026-11-11' }
		});
		expect(parseRates([])).toBeNull();
		expect(parseRates('nope')).toBeNull();
	});
});

describe('timeIn', () => {
	// 2026-11-13 00:00 UTC: Sydney (AEDT, +11) 11:00 Fri; Chicago (CST, -6) 6:00 pm Thu;
	// Karachi (+5) 5:00 am Fri.
	const nov = new Date('2026-11-13T00:00:00Z');
	// 2026-04-10 20:00 UTC, after Sydney's DST ended on 5 Apr: AEST +10, 6:00 am Sat.
	// New York is on EDT (-4): 4:00 pm Fri.
	const apr = new Date('2026-04-10T20:00:00Z');

	it('gives the time there and the gap from Sydney', () => {
		expect(timeIn('Chicago', nov)).toEqual({
			answer: '6 pm Thu in Chicago',
			note: 'Chicago is 17 h behind Sydney (it is 11 am Fri in Sydney)'
		});
		expect(timeIn('karachi', nov)?.note).toContain('6 h behind Sydney');
	});

	it('follows daylight saving on both ends', () => {
		expect(timeIn('Sydney', nov)).toEqual({ answer: '11 am in Sydney' });
		expect(timeIn('Sydney', apr)).toEqual({ answer: '6 am in Sydney' });
		// New York: -4 in April, so 14 h behind AEST; -5 in January vs AEDT +11 is 16 h.
		expect(timeIn('new york', apr)?.note).toContain('14 h behind Sydney');
		expect(timeIn('nyc', new Date('2026-01-15T00:00:00Z'))?.note).toContain('16 h behind Sydney');
	});

	it('knows nicknames, airports and a leading "time in"; half-hour zones', () => {
		expect(timeIn('time in LHR', nov)?.answer).toContain('London');
		expect(timeIn('ldn', nov)?.answer).toContain('London');
		expect(timeIn('mumbai', nov)?.note).toContain('5 h 30 m behind');
	});

	it('is null for a place it does not know', () => {
		expect(timeIn('Narnia', nov)).toBeNull();
		expect(timeIn('', nov)).toBeNull();
	});
});
