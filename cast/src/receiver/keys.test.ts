import { describe, expect, it } from 'vitest';
import { keyAction } from './keys.ts';

describe('keyAction', () => {
	it('reads Back however the remote reports it', () => {
		for (const [key, code] of [
			['BrowserBack', 166],
			['GoBack', 0],
			['Escape', 27],
			['Backspace', 8],
			['Unidentified', 4],
			['Unidentified', 461]
		] as const)
			expect(keyAction(key, code)).toBe('back');
	});

	it('keeps the arrows for navigation', () => {
		expect(keyAction('ArrowLeft', 37)).toBe('left');
		expect(keyAction('ArrowDown', 40)).toBe('down');
	});

	it('sends every other key on, and ignores modifiers', () => {
		expect(keyAction('Enter', 13)).toBe('send');
		expect(keyAction('MediaPlayPause', 179)).toBe('send');
		expect(keyAction('Shift', 16)).toBe('ignore');
	});
});
