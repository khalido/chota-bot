// How messages reach the core: Cast on a TV, or the demo in a browser. Both hand over parsed JSON per sender.
import { NAMESPACE, type KeyEvent, type Reply } from '../protocol/schema.ts';

export type Handlers = {
	message(sender: string, data: unknown): void;
	gone(sender: string): void;
};

export type Transport = {
	name: string;
	start(h: Handlers): void;
	reply(to: string, reply: Reply): void;
	/** To every connected sender. */
	broadcast(message: KeyEvent): void;
	/** Close the app (Back on the remote). */
	close(): void;
};

const SDK = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';

/** Load Google's receiver SDK (Google says never to self-host it) and start a Cast receiver on our namespace. */
export async function castTransport(): Promise<Transport> {
	await new Promise<void>((resolve, reject) => {
		const s = document.createElement('script');
		s.src = SDK;
		s.onload = () => resolve();
		s.onerror = () => reject(new Error('the Cast receiver SDK did not load'));
		document.head.append(s);
	});
	const ctx = cast.framework.CastReceiverContext.getInstance();
	return {
		name: 'cast',
		start(h) {
			// The namespace is declared in the options and the listener added before start(), as the SDK requires.
			ctx.addCustomMessageListener(NAMESPACE, (e) => {
				let data = e.data;
				if (typeof data === 'string')
					try {
						data = JSON.parse(data);
					} catch {
						/* the core answers bad-message */
					}
				h.message(e.senderId, data);
			});
			ctx.addEventListener(cast.framework.system.EventType.SENDER_DISCONNECTED, (e) =>
				h.gone((e as unknown as { senderId: string }).senderId)
			);
			// Never hold the TV: when the page is hidden (Home, another app, an input switch), end the Cast session so the
			// sender sees it stop and the cast icon goes. pagehide covers a page torn down without a visibility change.
			const leave = () => {
				if (document.visibilityState === 'hidden') ctx.stop();
			};
			document.addEventListener('visibilitychange', leave);
			addEventListener('pagehide', () => ctx.stop(), { once: true });
			ctx.start({
				disableIdleTimeout: true,
				customNamespaces: { [NAMESPACE]: cast.framework.system.MessageType.JSON },
				// No media to play: don't fetch Shaka (it would also need ajax.googleapis.com in the CSP).
				skipShakaLoad: true,
				statusText: 'Dashboard'
			});
		},
		reply(to, reply) {
			try {
				ctx.sendCustomMessage(NAMESPACE, to, reply);
			} catch {
				// The sender has gone; nothing to tell.
			}
		},
		broadcast(message) {
			try {
				ctx.sendCustomMessage(NAMESPACE, undefined, message);
			} catch {
				// No sender connected.
			}
		},
		close: () => ctx.stop()
	};
}
