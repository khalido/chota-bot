// /receiver?demo: a fake sender in the page, so the receiver can be seen in a browser. It goes the way a TV does:
// split() into parts and a JSON round trip per message. ?demo=waiting sends nothing; ?demo&screen=bus picks a screen;
// ?demo&density=compact&accent=%237aa2c8 sets the theme; ?demo&cycle=5 shows each screen in turn for 5 s (the home
// page's preview); ?demo&banner=Shoes%20on shows a banner. window.demo.send(type, data) sends more from the console.
import { exampleScreens } from '../protocol/examples.ts';
import type { KeyEvent, MessageType, Reply } from '../protocol/schema.ts';
import { split } from '../protocol/split.ts';
import type { Transport } from './transport.ts';

const SENDER = 'demo-sender';

export function demoTransport(params: URLSearchParams): Transport {
	let deliver: (data: unknown) => void = () => {};
	const send = (type: MessageType, data: unknown) => {
		// Small parts, so the demo exercises the join.
		for (const m of split(type, data, { maxBytes: 16_000 })) deliver(JSON.parse(JSON.stringify(m)));
	};
	(window as unknown as { demo: unknown }).demo = { send };
	return {
		name: 'demo',
		start(h) {
			deliver = (d) => h.message(SENDER, d);
			if (params.get('demo') === 'waiting') return;
			const theme = Object.fromEntries(
				['accent', 'density', 'timezone'].flatMap((k) =>
					params.get(k) ? [[k, params.get(k)]] : []
				)
			);
			if (params.has('hour12')) Object.assign(theme, { hour12: true });
			if (Object.keys(theme).length) send('theme', theme);
			const screens = exampleScreens();
			send('screens', { screens, show: params.get('screen') ?? undefined });
			const every = Number(params.get('cycle'));
			const banner = params.get('banner');
			if (banner) send('banner', { text: banner, seconds: 3600 });
			if (every > 0) {
				let at = Math.max(
					0,
					screens.findIndex((s) => s.id === params.get('screen'))
				);
				setInterval(
					() => send('show', { screen: screens[++at % screens.length].id }),
					every * 1000
				);
			}
		},
		reply(to: string, reply: Reply) {
			console.info(`receiver → ${to}`, reply);
		},
		broadcast(message: KeyEvent) {
			console.info('receiver → every sender', message);
		},
		close() {
			console.info('Back: the app would close here');
		}
	};
}
