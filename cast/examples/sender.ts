// A sender in TypeScript (Bun or Node) with @khalido/home: launch the receiver on a TV and push one screen.
// Run: bun examples/sender.ts "Living Room TV" /path/to/home.jsonc
import { readFileSync } from 'node:fs';
import { createHome, loadHome, parseJsonc } from '@khalido/home';
import { tlsConnect } from '@khalido/home/cast/tls';
import { FINDERS } from '@khalido/home/finders';
import { split } from '../src/protocol/split.ts'; // copy split.ts from github.com/khalido/chota-bot (cast/)

const APP_ID = 'FCE23D20'; // the published receiver's app id
const NAMESPACE = 'urn:x-cast:dev.khalido.cast';
const [tv = 'Living Room TV', config = 'home.jsonc'] = process.argv.slice(2);

const home = createHome(
	loadHome(parseJsonc(readFileSync(config, 'utf8')), {
		env: process.env,
		finders: FINDERS,
		castConnect: tlsConnect
	})
);
const stop = new AbortController();
home.start(stop.signal).catch((e) => console.error('home stopped', e));
const cast = home.integration('cast');
if (!cast) throw new Error('no Cast devices in the config');
// Give discovery and the sockets up to 10 s, as the `home` CLI does, before the first write.
for (
	const until = Date.now() + 10_000;
	Date.now() < until && (home.part('cast')?.status ?? 'connecting') === 'connecting';
)
	await Bun.sleep(50);

// Launch, or reuse the receiver if it is already running.
await cast.launch(tv, APP_ID);

const screens = [
	{
		id: 'home',
		title: 'Home',
		columns: 2,
		blocks: [
			{ type: 'clock' },
			{ type: 'stat', label: 'Inside', value: 21.5, unit: '°C', delta: '+1° since 7 am' },
			{
				type: 'list',
				title: 'Today',
				span: 2,
				items: [
					{ text: 'Bins out', meta: 'tonight' },
					{ text: 'Swim', meta: '4 pm' }
				]
			}
		]
	}
];
// One revision per update; the receiver refuses anything older than the newest it has applied.
for (const message of split('screens', { screens }, { revision: Date.now() }))
	await cast.send(tv, NAMESPACE, message);

stop.abort();
