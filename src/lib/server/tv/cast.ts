/**
 * Chota's side of the Cast receiver (cast/, published as app FCE23D20 at
 * cast.khalido.dev/receiver): launch it on a TV, send it screens, stop it.
 *
 * Launching takes over the TV and ends whatever was on it, so `launchTv`
 * refuses a TV that is playing another app unless the caller says take over.
 * A TV in standby is fine (KO, 17 Nov: the board makes no sound, so waking
 * the TV for it is OK). `refreshTv` never launches: it only updates a TV
 * already showing the receiver.
 *
 * The receiver doesn't answer chota yet (@khalido/home's `send` doesn't read
 * replies), so a refused message shows only on the TV's own console.
 */
import { castStatus, type CastSnapshot } from '@khalido/home/cast';
import { split } from '../../../../cast/src/protocol/split.ts';
import { NAMESPACE, Payloads } from '../../../../cast/src/protocol/schema.ts';
import { getHome } from '#lib/server/home.ts';
import { buildScreens, gatherTv, type Screen } from './screens.ts';

export const APP_ID = 'FCE23D20';
/** The TV the board goes to unless a caller names another. */
export const DEFAULT_TV = 'Living Room TV';
/** A screen put up from chat stays this long, then the board goes back to its own. */
const CHAT_SCREEN_MS = 2 * 60 * 60_000;
/**
 * Resend everything this often even when nothing changed: a relaunched receiver
 * starts empty, and chota can't hear its pong yet (@khalido/home's `send`
 * doesn't read replies), so this bounds how long a TV stays blank.
 */
const RESEND_MS = 2 * 60_000;

const NOT_SET_UP = "the house isn't connected yet (no home config on this box)";

/** The chat screen, while it lasts. In memory: a restart drops it, which is fine. */
let chat: { screen: Screen; until: number } | null = null;
/** Per TV: the last screens sent, and when. */
const sent = new Map<string, { json: string; at: number }>();

function cast() {
	const h = getHome();
	const c = h?.home.integration('cast');
	const snapshot = h?.home.part('cast')?.state as CastSnapshot | undefined;
	return h && c && snapshot ? { client: c, snapshot } : null;
}

/** The TVs showing the receiver now, by name. */
export function tvsShowing(): string[] {
	const c = cast();
	if (!c) return [];
	return Object.values(c.snapshot.devices)
		.filter((d) => d.kind === 'device' && d.appId === APP_ID)
		.map((d) => d.name);
}

/** What a TV is doing, in a few words, or undefined when it isn't known. */
export function tvState(name: string): ReturnType<typeof castStatus>[number] | undefined {
	const c = cast();
	if (!c) return undefined;
	return castStatus(c.snapshot).find(
		(s) => s.kind === 'device' && s.name.toLowerCase() === name.toLowerCase()
	);
}

function chatScreens(now: number): Screen[] {
	if (chat && chat.until < now) chat = null;
	return chat ? [chat.screen] : [];
}

/** Send the screens to one TV, in parts. `show` picks the one on screen. */
async function push(tv: string, screens: Screen[], show?: string): Promise<void> {
	const c = cast();
	if (!c) throw new Error(NOT_SET_UP);
	const data = { screens, ...(show ? { show } : {}) };
	// The receiver refuses a whole payload over any of its limits, silently to chota: check here so it fails loudly.
	const checked = Payloads.screens.safeParse(data);
	if (!checked.success) {
		const issue = checked.error.issues[0];
		throw new Error(`the TV would refuse these screens: ${issue.path.join('.')}: ${issue.message}`);
	}
	const revision = Date.now();
	for (const message of split('screens', data, { revision }))
		await c.client.send(tv, NAMESPACE, message);
	sent.set(tv, { json: JSON.stringify(screens), at: revision });
}

export type LaunchResult =
	| { ok: true; tv: string; screens: string[]; showing?: string }
	| { ok: false; error: string; busyWith?: string };

/**
 * Put the board on a TV and show `show` (a screen id), with `extra` as the
 * chat screen. Refuses a TV busy with another app unless `takeOver`.
 */
export async function launchTv(
	opts: { tv?: string; show?: string; extra?: Screen; takeOver?: boolean } = {}
): Promise<LaunchResult> {
	const tv = opts.tv ?? DEFAULT_TV;
	const c = cast();
	if (!c) return { ok: false, error: NOT_SET_UP };
	const state = tvState(tv);
	if (!state) return { ok: false, error: `no TV called "${tv}"` };
	if (state.state === 'offline') return { ok: false, error: `${tv} isn't answering` };
	const ours = state.app !== undefined && tvsShowing().includes(state.name);
	if (state.state === 'busy' && !ours && !opts.takeOver)
		return { ok: false, error: `${tv} is busy`, busyWith: state.app };

	await c.client.launch(state.name, APP_ID);
	const now = new Date();
	const extra = opts.extra ? [opts.extra] : chatScreens(now.getTime());
	const screens = buildScreens(await gatherTv(now), now, extra);
	const show = opts.extra?.id ?? opts.show;
	await push(state.name, screens, show);
	// Kept only once it's on screen, so a failed put never turns up on a later refresh.
	if (opts.extra) chat = { screen: opts.extra, until: Date.now() + CHAT_SCREEN_MS };
	return { ok: true, tv: state.name, screens: screens.map((s) => s.id), showing: show };
}

/** Close the board on a TV, if it's showing. */
export async function stopTv(tv = DEFAULT_TV): Promise<{ ok: boolean; error?: string }> {
	const c = cast();
	if (!c) return { ok: false, error: NOT_SET_UP };
	const name = tvsShowing().find((n) => n.toLowerCase() === tv.toLowerCase());
	if (!name) return { ok: false, error: `the board isn't on ${tv}` };
	await c.client.stop(name);
	sent.delete(name);
	chat = null;
	return { ok: true };
}

/**
 * Update every TV already showing the board, when its screens changed or
 * `RESEND_MS` passed. Returns the TVs sent to. Never launches.
 */
export async function refreshTv(now = new Date()): Promise<string[]> {
	const tvs = tvsShowing();
	for (const name of sent.keys()) if (!tvs.includes(name)) sent.delete(name);
	if (!tvs.length) return [];
	const screens = buildScreens(await gatherTv(now), now, chatScreens(now.getTime()));
	const json = JSON.stringify(screens);
	const updated: string[] = [];
	for (const tv of tvs) {
		const last = sent.get(tv);
		if (last && last.json === json && now.getTime() - last.at < RESEND_MS) continue;
		await push(tv, screens);
		updated.push(tv);
	}
	return updated;
}
