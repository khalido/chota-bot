import { describe, expect, it } from 'vitest';
import { skyOf } from './sky.ts';

describe('skyOf', () => {
	it('reads the usual forecast words', () => {
		expect(skyOf('Showers', 12)).toBe('rain');
		expect(skyOf('Possible thunderstorm', 12)).toBe('storm');
		expect(skyOf('Partly cloudy', 12)).toBe('partly');
		expect(skyOf('Overcast', 12)).toBe('cloud');
		expect(skyOf('Fog then sunny', 8)).toBe('fog');
		expect(skyOf('Sunny', 12)).toBe('sun');
	});

	it('makes a clear sky after dark night', () => {
		expect(skyOf('Clear', 22)).toBe('night');
		expect(skyOf('Partly cloudy', 4)).toBe('night');
		expect(skyOf('Rain', 22)).toBe('rain');
	});

	it('reads clear-with-some-cloud wordings as partly, night after dark', () => {
		expect(skyOf('Clear with periodic clouds', 12)).toBe('partly');
		expect(skyOf('Clear with periodic clouds', 20)).toBe('night');
		expect(skyOf('Sunny with intermittent clouds', 12)).toBe('partly');
		expect(skyOf('Mostly clear', 22)).toBe('night');
		expect(skyOf('Mostly cloudy', 12)).toBe('cloud');
	});
});
