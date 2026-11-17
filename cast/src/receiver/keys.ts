// What a remote key does on the receiver. Only Back and the arrows are ours: the page acts on them and stops the
// browser's default. Every other key goes to the senders and keeps its default, so the TV's own keys still work.
export type KeyAction = 'back' | 'left' | 'right' | 'up' | 'down' | 'send' | 'ignore';

/**
 * Back as browsers and TV remotes report it. Chromium on Android maps the system Back to BrowserBack (keyCode 166);
 * webOS and some remotes send 461; others send Backspace (8). The receiver has no text input, so Backspace is safe.
 */
const BACK_KEYS = new Set(['BrowserBack', 'GoBack', 'Back', 'Escape', 'Backspace']);
const BACK_CODES = new Set([4, 8, 27, 166, 461]);
const ARROWS: Record<string, KeyAction> = {
	ArrowLeft: 'left',
	ArrowRight: 'right',
	ArrowUp: 'up',
	ArrowDown: 'down'
};
/** Keys that are only modifiers: never worth a message. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

export function keyAction(key: string, keyCode: number): KeyAction {
	if (MODIFIERS.has(key)) return 'ignore';
	if (BACK_KEYS.has(key) || BACK_CODES.has(keyCode)) return 'back';
	return ARROWS[key] ?? 'send';
}
