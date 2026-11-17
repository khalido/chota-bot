import { mount } from 'svelte';
import { createCore } from '../protocol/core.ts';
import App from './App.svelte';
import { demoTransport } from './demo.ts';
import './receiver.css';
import type { KeyEvent } from '../protocol/schema.ts';
import { castTransport, lifecycle, type Transport } from './transport.ts';
import { view } from './view.svelte.ts';
import { awakeState, keepAwake } from './awake.ts';

const SWEEP_MS = 5_000;
const params = new URLSearchParams(location.search);

// The last few uncaught errors, so a ping can show what broke on a TV we can't inspect.
const errors: string[] = [];
const note = (what: unknown) => {
	const e = what as { message?: string; stack?: string };
	errors.push(String(e?.stack ?? e?.message ?? what).slice(0, 400));
	if (errors.length > 5) errors.shift();
};
window.addEventListener('error', (e) => note(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => note(e.reason));

/** Whether anything of ours could be covered: visibility, focus and what sits at the centre of the screen. */
function pageState() {
	const top = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
	const name = top
		? `${top.tagName.toLowerCase()}${top.id ? '#' + top.id : ''}.${String(top.className).split(' ').slice(0, 3).join('.')}`
		: 'nothing';
	const body = [...document.body.children].map((e) => e.tagName.toLowerCase()).join(' ');
	return `${document.visibilityState}, focus ${document.hasFocus()}, centre ${name}, ${innerWidth}x${innerHeight}, body: ${body}`;
}

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
	const core = createCore(Date.now, () => ({
		userAgent: navigator.userAgent,
		fps,
		awake: awakeState(),
		drawn:
			document.querySelectorAll('header nav span').length ||
			(document.querySelector('section') ? 1 : 0),
		errors: errors.length ? errors : undefined,
		lifecycle: lifecycle.length ? lifecycle : undefined,
		page: pageState()
	}));
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
	// Only on a TV: the demo and the landing preview shouldn't hold a laptop awake.
	if (transport.name === 'cast') keepAwake();
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
