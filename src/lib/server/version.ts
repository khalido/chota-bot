/**
 * Deploy freshness for the /admin panel — is the running build the latest
 * commit, or has the kiosk fallen behind `origin/main`?
 *
 * The running build's short SHA rides in `version` from `$app/environment`
 * (`<pkg version>+<sha>`, stamped by `svelte.config.js > kit.version.name`).
 * `getDeployStatus()` adds the comparison: a quiet `git fetch` refreshes the
 * `origin/main` ref, then `git rev-list` counts the gap. Everything degrades to
 * `state: 'unknown'` on any failure (offline kiosk, built outside git, no git
 * on PATH) so the admin page never breaks over a version check.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { version } from '$app/environment';

const exec = promisify(execFile);

/** Short git SHA the running app was built from, or `'nogit'` (built outside git). */
export const buildCommit = version.split('+')[1] ?? 'nogit';

export interface DeployStatus {
	/** Short SHA the running app was built from. */
	commit: string;
	/** `origin/main`'s tip — short SHA, or `''` when the remote check failed. */
	latest: string;
	/** How the running build compares to `origin/main`. */
	state: 'up-to-date' | 'behind' | 'ahead' | 'unknown';
	/** Commits on `origin/main` the running build doesn't have. */
	behind: number;
}

export async function getDeployStatus(): Promise<DeployStatus> {
	const base: DeployStatus = { commit: buildCommit, latest: '', state: 'unknown', behind: 0 };
	if (buildCommit === 'nogit') return base;
	try {
		// Refresh the origin/main ref only — no working-tree changes, ~1-2s.
		await exec('git', ['fetch', '--quiet', 'origin', 'main'], { timeout: 10_000 });
		const latest = (await exec('git', ['rev-parse', '--short', 'FETCH_HEAD'])).stdout.trim();
		const count = async (range: string) =>
			Number((await exec('git', ['rev-list', '--count', range])).stdout.trim());
		const behind = await count(`${buildCommit}..FETCH_HEAD`);
		const ahead = await count(`FETCH_HEAD..${buildCommit}`);
		return {
			commit: buildCommit,
			latest,
			behind,
			state: behind > 0 ? 'behind' : ahead > 0 ? 'ahead' : 'up-to-date'
		};
	} catch {
		return base;
	}
}
