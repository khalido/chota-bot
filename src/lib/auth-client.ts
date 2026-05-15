import { createAuthClient } from 'better-auth/svelte';

/**
 * Browser-side better-auth client. Use for sign-in/out, reactive session
 * state via `authClient.useSession()`. Server-side, import `auth` from
 * `$lib/server/auth` instead.
 */
export const authClient = createAuthClient();
