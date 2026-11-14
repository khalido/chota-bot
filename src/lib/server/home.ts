/**
 * The house through `@khalido/home`: one long-lived home for the devices chota
 * reads or changes (the AC, the Cast devices, the printer, the weather, solar),
 * started at boot from `hooks.server.ts`. Every home tool reads this one.
 *
 * The config is a home JSONC file, the same format the `home` CLI and jaldi
 * read (`@khalido/home` docs/config.md), at `HOME_CONFIG` or `data/home.jsonc`.
 * It names devices and addresses, so it stays out of git. Without it the home
 * tools say the house isn't set up, and nothing else changes.
 *
 * Left out: the Soloist speaker (`tools/music.ts` still owns its one socket;
 * a `spotify` entry here is skipped) and Hue until it's paired (its entry needs
 * a key, and `loadHome` refuses an entry whose key is unset).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import {
	createHome,
	houseSummary,
	loadHome,
	parseJsonc,
	ventilation,
	type HomeConfig,
	type HomeIntegration,
	type Ventilation
} from '@khalido/home';
import { tlsConnect } from '@khalido/home/cast/tls';
import { FINDERS, fileCache } from '@khalido/home/finders';
import { ftpFetch } from '@khalido/home/weather/ftp';
import { HOME_CONFIG } from '$app/env/private';
import { log, logErr } from '#lib/server/log.ts';

const SCOPE = 'home';
const DEFAULT_PATH = 'data/home.jsonc';
const CACHE_PATH = 'data/home-addresses.json';

type Home = ReturnType<typeof createHome<HomeIntegration>>;

declare global {
	// One home for the process, kept across dev reloads like the music connection.
	var __chotaHome: { home: Home; config: HomeConfig; stop: AbortController } | undefined;
}

/** Start the home from its config, once. Missing config: logged, and the home stays off. */
export function bootHome(path = HOME_CONFIG || DEFAULT_PATH): void {
	stopHome();
	if (!existsSync(path)) {
		log(SCOPE, `no home config at ${path}: home tools are off`);
		return;
	}
	try {
		const config = parseJsonc(readFileSync(path, 'utf8')) as HomeConfig;
		config.devices = (config.devices ?? []).filter((d) => d.connector !== 'spotify');
		const readFile = (p: string) =>
			readFileSync(resolve(dirname(path), p.replace(/^~(?=\/)/, homedir())), 'utf8');
		const integrations = loadHome(config, {
			env: process.env,
			readFile,
			ftpFetch: ftpFetch(),
			finders: FINDERS,
			castConnect: tlsConnect,
			cache: fileCache(CACHE_PATH),
			configAt: statSync(path).mtimeMs
		});
		const home = createHome(integrations, (_snapshot, change) => {
			if (change.after.status !== change.before.status)
				log(SCOPE, `${change.name}: ${change.before.status} → ${change.after.status}`);
		});
		const stop = new AbortController();
		home.start(stop.signal).catch((err) => logErr(SCOPE, 'the home stopped', err));
		globalThis.__chotaHome = { home, config, stop };
		log(SCOPE, `started: ${integrations.map((i) => i.name).join(', ')}`);
	} catch (err) {
		logErr(SCOPE, `couldn't start the home from ${path}`, err);
	}
}

export function stopHome(): void {
	globalThis.__chotaHome?.stop.abort();
	globalThis.__chotaHome = undefined;
}

/** The running home and its config, or null when it isn't set up. */
export function getHome(): { home: Home; config: HomeConfig } | null {
	const h = globalThis.__chotaHome;
	return h ? { home: h.home, config: h.config } : null;
}

/** The house in a paragraph, and whether to open the windows. Null when the home isn't set up. */
export function houseNow(now = Date.now()): { summary: string; windows: Ventilation } | null {
	const h = getHome();
	if (!h) return null;
	const snapshot = h.home.snapshot();
	return { summary: houseSummary(snapshot, h.config, { now }), windows: ventilation(snapshot) };
}
