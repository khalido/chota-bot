// refreshWeather against a fake Google: the hourly forecast comes 24 hours a
// page, so 48 hours takes two requests.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/env/private', () => ({ GOOGLE_WEATHER_API_KEY: 'test' }));
vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
vi.mock('#lib/server/config.ts', () => ({
	getConfig: () => ({ home: { lat: -33.9, lon: 151.2 } })
}));

const fetchJson = vi.fn();
vi.mock('./http', () => ({ fetchJson: (url: string) => fetchJson(url) }));

const { refreshWeather } = await import('./weather');
const { logErr } = await import('#lib/server/log.ts');

const START = Date.UTC(2026, 10, 10, 2);
const hoursFrom = (first: number, count: number) =>
	Array.from({ length: count }, (_, i) => ({
		interval: { startTime: new Date(START + (first + i) * 3_600_000).toISOString() },
		temperature: { degrees: 20 }
	}));

/** Google's paging: 24 hours, then the rest behind a token. */
function google(pages: Record<string, { forecastHours: unknown[]; nextPageToken?: string }>) {
	fetchJson.mockImplementation(async (url: string) => {
		if (url.includes('currentConditions')) return { temperature: { degrees: 21 } };
		return pages[new URL(url).searchParams.get('pageToken') ?? 'first'];
	});
}

beforeEach(() => {
	fetchJson.mockReset();
	vi.mocked(logErr).mockClear();
});

describe('refreshWeather forecast paging', () => {
	it('follows nextPageToken to get all 48 hours, in order', async () => {
		google({
			first: { forecastHours: hoursFrom(0, 24), nextPageToken: 'p2' },
			p2: { forecastHours: hoursFrom(24, 24) }
		});
		const w = await refreshWeather();
		expect(w.hourly).toHaveLength(48);
		expect(w.hourly.at(-1)!.at.getTime()).toBe(START + 47 * 3_600_000);
		expect(logErr).not.toHaveBeenCalled();
	});

	it('logs when Google sends fewer hours than asked, and keeps what came', async () => {
		google({ first: { forecastHours: hoursFrom(0, 24) } });
		const w = await refreshWeather();
		expect(w.hourly).toHaveLength(24);
		expect(logErr).toHaveBeenCalledWith('weather', 'asked Google for 48 forecast hours, got 24');
	});
});
