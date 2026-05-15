/**
 * Server-only loader for chota.config.ts.
 *
 * The config lives at the repo root (`chota.config.ts`, gitignored).
 * Setup: `cp chota.config.example.ts chota.config.ts` then edit.
 *
 * Type-checking happens at compile time via the `defineChota` literal —
 * no runtime validation needed for a TS literal we control.
 */
import config from '../../../chota.config';
import type { ChotaConfig, Kid } from '$lib/config';

export function getConfig(): ChotaConfig {
	return config;
}

export function findKid(name: string, c: ChotaConfig = getConfig()): Kid | undefined {
	return c.kids.find((k) => k.name.toLowerCase() === name.toLowerCase());
}
