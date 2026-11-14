/**
 * The house as agent tools, through `#lib/server/home.ts` (`@khalido/home`):
 *
 * - `home_status`: the house in a paragraph (lights, the AC, what's playing,
 *   the printer, solar, outside, the windows, what's down). Read-only; anyone.
 * - `aircon`: the Daikin. Read for anyone; changes only for a parent who asked,
 *   never on a quiet turn. Each change reports what the unit confirmed.
 *
 * KO's rule for modes (14 Nov 2026): dry on warm or muggy days that need only a
 * little cooling (it works well and is cheap); cool at 24–25 °C for a properly
 * hot afternoon. Never steer away from dry.
 *
 * `CHOTA_HOME_DRY_RUN=true` makes every AC change a dry run (tests, and a run
 * with people home).
 */
import { tool } from 'ai';
import { z } from 'zod';
import { acText } from '@khalido/home/daikin';
import { isParent } from '#lib/server/config.ts';
import { getHome, houseNow } from '#lib/server/home.ts';
import { AskerSchema, type Asker } from '#lib/server/tools/content.ts';
import { errorMessage, log } from '#lib/server/log.ts';

const NOT_SET_UP = "the house isn't connected yet (no home config on this box)";

export const homeStatusTool = tool({
	description:
		'The house right now in a few lines: lights on by room, the aircon, what\'s playing, a printer that needs attention, solar and the grid, the temperature outside, whether to open the windows, and anything not answering. Use for "what\'s on at home", "is the AC on", "should I open the windows".',
	inputSchema: z.object({}),
	execute: async () => {
		const now = houseNow();
		if (!now) return { error: NOT_SET_UP };
		return {
			summary: now.summary,
			windows: now.windows.advice,
			...(now.windows.why ? { windowsWhy: now.windows.why } : {})
		};
	}
});

/** Why `asker` can't change the AC, or undefined. Exported for tests. */
export function refuseAc(asker: Asker | undefined): string | undefined {
	if (!asker?.sender) return "I can't tell who's asking";
	if (asker.quiet) return 'only when someone asks me to';
	if (!isParent(asker.sender)) return 'only a parent can change the aircon';
	return undefined;
}

const dryRun = () => process.env.CHOTA_HOME_DRY_RUN === 'true';

export const airconTool = tool({
	description:
		'The aircon (one Daikin unit). action=status reads it. action=off, or action=mode with a mode, changes it, only when someone asks. Modes: dry for a warm or muggy day that needs a little cooling (it is good and cheap: offer it), cool at 24–25 °C for a properly hot afternoon, heat for cold, fan, auto. cool defaults to 25 and heat to 27 when no temperature is given. Report the state the unit confirmed; if not confirmed yet, say it was sent.',
	inputSchema: z.object({
		action: z.enum(['status', 'off', 'mode']),
		mode: z.enum(['dry', 'cool', 'heat', 'fan', 'auto']).optional(),
		targetC: z
			.number()
			.min(16)
			.max(30)
			.optional()
			.describe('Setpoint for cool, heat or auto, in °C. Not for dry or fan.')
	}),
	contextSchema: z.object({ asker: AskerSchema.optional() }),
	execute: async ({ action, mode, targetC }, { context }) => {
		const h = getHome();
		const ac = h?.home.integration('daikin');
		if (!h || !ac) return { error: NOT_SET_UP };
		const state = h.home.part('daikin')?.state;
		if (action === 'status')
			return state
				? { aircon: acText(state), asOf: state.asOf }
				: { error: 'the aircon has not been read yet' };

		const refused = refuseAc(context?.asker);
		if (refused) return { error: refused };
		if (action === 'mode' && !mode) return { error: 'say which mode' };
		if (targetC !== undefined && (mode === 'dry' || mode === 'fan'))
			return { error: `${mode} takes no temperature` };
		try {
			const opts = { dryRun: dryRun() };
			const done =
				action === 'off'
					? await ac.client.power(false, opts)
					: await ac.client.mode(mode!, targetC, opts);
			log(
				'home',
				`aircon ${action}${mode ? ` ${mode}` : ''}${targetC ? ` ${targetC}` : ''} by ${context?.asker?.sender}: confirmed=${done.confirmed}${opts.dryRun ? ' (dry run)' : ''}`
			);
			return {
				aircon: acText(done.state),
				confirmed: done.confirmed,
				...(opts.dryRun ? { dryRun: true } : {})
			};
		} catch (err) {
			return { error: `couldn't change the aircon: ${errorMessage(err)}` };
		}
	}
});
