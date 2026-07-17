/**
 * /login — the sign-in screen the hooks.server.ts guard bounces to.
 *
 * Already-allowed users go straight to /admin. A signed-in-but-not-allowed
 * user (any Google account can complete OAuth) sees who they're signed in as
 * and how to get on the list, instead of a bare 403.
 */
import { redirect } from '@sveltejs/kit';
import { isAdminEmail } from '$lib/server/config';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const email = locals.user?.email ?? null;
	if (isAdminEmail(email)) redirect(303, '/admin');
	return { email };
};
