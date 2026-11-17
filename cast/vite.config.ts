import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { APP_ID, SOURCE } from './src/config.ts';
import { LIMITS, NAMESPACE } from './src/protocol/schema.ts';

/**
 * The receiver's Content-Security-Policy, added at build only (dev's hot reload needs inline scripts and its own
 * socket). connect-src allows only ws://localhost: the Cast SDK's message bus to the device is a WebSocket to
 * ws://localhost:<port the platform gives>/v2/ipc; 'none' would cut it. Nothing else may connect anywhere.
 */
const RECEIVER_CSP = [
	"default-src 'none'",
	"script-src 'self' https://www.gstatic.com",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' https: data:",
	"font-src 'self' https: data:",
	'connect-src ws://localhost:*',
	"base-uri 'none'",
	"form-action 'none'"
].join('; ');

const csp = (): Plugin => ({
	name: 'receiver-csp',
	apply: 'build',
	transformIndexHtml: {
		order: 'post',
		handler: (html, ctx) =>
			ctx.path.endsWith('/receiver.html')
				? html.replace(
						'<!-- csp -->',
						`<meta http-equiv="Content-Security-Policy" content="${RECEIVER_CSP}" />`
					)
				: html
	}
});

/** /llms.txt from src/llms.txt, with the app id, namespace and limits filled in from the code. */
const llms = (): Plugin => {
	const text = () =>
		readFileSync('src/llms.txt', 'utf8')
			.replaceAll('{{APP_ID}}', APP_ID)
			.replaceAll('{{NAMESPACE}}', NAMESPACE)
			.replaceAll('{{SOURCE}}', SOURCE)
			.replaceAll('{{PART_BYTES}}', String(LIMITS.partBytes))
			.replaceAll(
				'{{LIMITS}}',
				Object.entries(LIMITS)
					.map(([k, v]) => `${k} ${v}`)
					.join('; ') +
					'. partialMs: a half-received payload is dropped this long after its first part, or when its sender disconnects.'
			);
	return {
		name: 'llms-txt',
		configureServer: (s) =>
			void s.middlewares.use((req, res, next) => {
				if (req.url !== '/llms.txt') return next();
				res.setHeader('Content-Type', 'text/plain; charset=utf-8');
				res.end(text());
			}),
		generateBundle() {
			this.emitFile({ type: 'asset', fileName: 'llms.txt', source: text() });
		}
	};
};

/** /receiver serves receiver.html in dev and preview, as Cloudflare's static assets do once deployed. */
const cleanUrls = (): Plugin => {
	const rewrite = (req: { url?: string }, _: unknown, next: () => void) => {
		const [path, query] = (req.url ?? '').split('?');
		if (path === '/receiver' || path === '/receiver/')
			req.url = `/receiver.html${query ? `?${query}` : ''}`;
		next();
	};
	return {
		name: 'clean-urls',
		configureServer: (s) => void s.middlewares.use(rewrite),
		configurePreviewServer: (s) => void s.middlewares.use(rewrite)
	};
};

export default defineConfig({
	plugins: [tailwindcss(), svelte(), csp(), cleanUrls(), llms()],
	build: {
		rollupOptions: { input: { index: 'index.html', receiver: 'receiver.html' } }
	},
	test: {
		include: ['src/**/*.test.ts']
	}
});
