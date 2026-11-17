import { mount } from 'svelte';
import { createCore } from '../protocol/core.ts';
import App from './App.svelte';
import { demoTransport } from './demo.ts';
import './receiver.css';
import type { KeyEvent } from '../protocol/schema.ts';
import { castTransport, type Transport } from './transport.ts';
import { view } from './view.svelte.ts';

const SWEEP_MS = 5_000;
const params = new URLSearchParams(location.search);

async function boot() {
	// Count frames, so a ping shows whether the animations run smoothly on the TV.
	let fps: number | undefined;
	let frames = 0;
	let since = performance.now();
	const count = (t: number) => {
		frames++;
		if (t - since >= 5_000) {
			fps = Math.round((frames * 1000) / (t - since));
			frames = 0;
			since = t;
		}
		requestAnimationFrame(count);
	};
	requestAnimationFrame(count);
	const core = createCore(Date.now, () => ({ userAgent: navigator.userAgent, fps }));
	let transport: Transport | undefined;
	// The waiting clock shows at once, even if the SDK is slow to load.
	mount(App, {
		target: document.getElementById('app')!,
		props: {
			close: () => transport?.close(),
			select(id: string) {
				if (core.select(id)) view.state = core.state;
			},
			sendKey: (key: KeyEvent) => transport?.broadcast(key)
		}
	});
	setInterval(() => (view.now = Date.now()), 1_000);
	try {
		transport = params.has('demo') ? demoTransport(params) : await castTransport();
	} catch (e) {
		// Not on a Cast device, or the SDK didn't load: the waiting screen still shows.
		console.warn(e);
	}
	if (!transport) return;
	const t = transport;
	const send = (out: ReturnType<typeof core.sweep>) => out.forEach((o) => t.reply(o.to, o.reply));
	t.start({
		message(sender, data) {
			const { out, changed } = core.receive(sender, data);
			if (changed) view.state = core.state;
			send(out);
		},
		gone: (sender) => core.senderGone(sender)
	});
	setInterval(() => send(core.sweep()), SWEEP_MS);
}

boot();
