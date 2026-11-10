import { composeText, getPrintKinds } from '#lib/server/print/composers.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const kinds = getPrintKinds();
	const texts: Record<string, string> = {};
	for (const k of kinds) texts[k] = (await composeText(k)) ?? '';
	return { kinds: [...kinds], texts };
};
