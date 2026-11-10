import adapter from '@sveltejs/adapter-node';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';

// Build stamp: `<package version>+<short git sha>`, computed at build/dev start.
// Surfaced via `version` from `$app/env` and shown on /admin so you can
// confirm which commit the kiosk is actually running. Falls back gracefully if
// built outside a git checkout (e.g. from a tarball).
function buildVersion() {
	const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
	let sha = 'nogit';

	try {
		sha = execSync('git rev-parse --short HEAD').toString().trim();
	} catch {
		// no git — keep the fallback
	}
	return `${pkg.version}+${sha}`;
}

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// adapter-node — runs on the kiosk box (Linux). `bun run build` → build/index.js;
			// run with `bun build/index.js` (PORT / PROTOCOL_HEADER from .env). systemd supervises
			// it on the box; see docs/deploy.md. No `paths.origin`: the box answers on several
			// names, so each request's origin comes from its Host and X-Forwarded-Proto headers.
			// BUILD_OUT: deploy.sh builds into build.next/ and swaps it in, so a failed
			// build never touches the build/ the live process is serving from.
			adapter: adapter({ out: process.env.BUILD_OUT || 'build' }),
			version: { name: buildVersion() }
		})
	],
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
