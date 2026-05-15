import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	// Fixed port — this is the only service on the kiosk machine, and the
	// better-auth OAuth redirect URIs (registered in GCP) are bound to it.
	// `strictPort` so a busy port fails loudly instead of silently shifting.
	server: { port: 8000, strictPort: true },
	preview: { port: 8000, strictPort: true },
	// Native ESM addon (Skia) — keep it out of Vite's transform/bundle pipeline.
	// `@lucide/svelte` ships uncompiled .svelte source, so it must NOT be SSR-
	// externalized (Node can't import .svelte) — vite-plugin-svelte has to
	// transform it. (Usually auto-detected via the "svelte" export condition,
	// but be explicit so a prod build can't regress.)
	ssr: { external: ['@napi-rs/canvas'], noExternal: ['@lucide/svelte'] },
	optimizeDeps: { exclude: ['@napi-rs/canvas'] },
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
