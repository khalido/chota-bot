/** The published receiver's Cast app id (Google Cast console, unlisted). */
export const APP_ID = 'FCE23D20';
/** Where the receiver lives; shown small on the TV so it's clear what's on screen. */
export const SITE = 'cast.khalido.dev';
/** The receiver lives in chota-bot's cast/ folder. */
export const SOURCE = 'https://github.com/khalido/chota-bot/tree/main/cast';
export const sourceFile = (path: string) =>
	`https://github.com/khalido/chota-bot/blob/main/cast/${path}`;
