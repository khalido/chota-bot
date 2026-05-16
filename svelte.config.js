import adapter from '@sveltejs/adapter-node';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Build stamp: `<package version>+<short git sha>`, computed at build/dev start.
// Surfaced via `version` from `$app/environment` and shown on /admin so you can
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

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// adapter-node — runs on the kiosk box (Linux). `npm run build` → build/index.js;
		// run with `node build` (PORT / ORIGIN / HOST from .env). systemd supervises
		// it on the box; see docs/deploy.md.
		adapter: adapter(),

		version: { name: buildVersion() },

		typescript: {
			config: (config) => ({
				...config,
				include: [...config.include, '../drizzle.config.ts']
			})
		}
	}
};

export default config;
