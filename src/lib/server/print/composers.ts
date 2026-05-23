/**
 * Registry of printable "kinds" → their plain-text payload.
 *
 * The plain text is the canonical, debuggable form; the image print path
 * (`renderReceiptPng`) and the styled `/print/<who>` page also render the
 * morning data, so there's one source of truth per recipient.
 *
 * Kinds:
 *   - `test`     — the ruler smoke-test sheet
 *   - `family`   — the whole-family weekend sheet (one print for everyone)
 *   - `<person>` — one family member's brief (household sections + their
 *                  school day if they're a kid with a Sentral timetable)
 */
import { gatherBrief } from './brief';
import {
	recipientToSections,
	sectionsToText,
	getRecipients,
	isPrintRecipient,
	FAMILY_RECIPIENT
} from './sections';
import { getSchedule } from '$lib/server/tools/sentral';
import { briefToPng } from './snapshot';
import { renderReceiptPng } from './render';
import { logErr } from '$lib/server/log';
import { sydneyYMD } from '$lib/time';

/**
 * The school-timetable day to render: an explicit `date` wins; otherwise
 * tomorrow's date for the evening (`day: 'tomorrow'`) brief, else today.
 */
function scheduleDateFor(date: string | undefined, day: 'today' | 'tomorrow'): string | undefined {
	if (date) return date;
	return day === 'tomorrow' ? sydneyYMD(new Date(Date.now() + 86_400_000)) : undefined;
}

/** Printable URL kinds = the `test` sheet + the whole-family weekend sheet + every family member. */
export function getPrintKinds(): readonly string[] {
	return ['test', FAMILY_RECIPIENT, ...getRecipients()];
}

/** Title-cased recipient name for the masthead, e.g. `savi` → `Savi`. */
function recipientName(who: string): string {
	return who[0].toUpperCase() + who.slice(1);
}

/** Printer smoke test: a fresh timestamp + length samples + a column ruler. */
function testSheet(): string {
	return [
		'CHOTA PRINT TEST',
		new Date().toISOString().slice(0, 19).replace('T', ' '),
		'',
		'short (20):',
		'12345678901234567890',
		'',
		'medium (40):',
		'1234567890123456789012345678901234567890',
		'',
		'long (64):',
		'1234567890123456789012345678901234567890123456789012345678901234',
		'',
		'column ruler (last digit not wrapped = your width):',
		'1.........2.........3.........4.........5.........6.........7',
		'1234567890123456789012345678901234567890123456789012345678901234567890',
		'',
		'OK'
	].join('\n');
}

/**
 * Returns the plain-text payload for `kind`, or null if unknown. `date`
 * (YYYY-MM-DD) overrides the school-timetable day — lets you reprint a past
 * day's schedule; omitted → today. `day: 'tomorrow'` shifts the whole brief
 * one day ahead (the evening print).
 */
export async function composeText(
	kind: string,
	date?: string,
	day: 'today' | 'tomorrow' = 'today'
): Promise<string | null> {
	if (kind === 'test') return testSheet();
	if (!isPrintRecipient(kind)) return null;
	const d = await gatherBrief({ day });
	// getSchedule reads the cached .ics — empty for a non-kid, so their brief
	// is just the household sections.
	const schedule = await getSchedule(kind, scheduleDateFor(date, day));
	return sectionsToText(
		d.date,
		recipientToSections(kind, d, schedule),
		d.closing,
		recipientName(kind),
		d.printedAt
	);
}

/**
 * Returns the PNG payload for `kind` — a screenshot of the styled `/print/<who>`
 * page (the canonical "designed print"). Falls back to the canvas renderer
 * always for `test` (no HTML page exists) and on any screenshot failure (e.g.
 * agent-browser not installed). null if `kind` is unknown. When the fallback
 * fires, `fallback` carries a short reason — callers surface it (job result,
 * /admin/jobs) so a silently-degraded morning print is visible.
 */
export type ComposedImage = { image: Buffer; fallback?: string };

export async function composeImage(
	kind: string,
	date?: string,
	day: 'today' | 'tomorrow' = 'today'
): Promise<ComposedImage | null> {
	if (kind === 'test') return { image: await renderReceiptPng(testSheet(), {}) };
	if (!isPrintRecipient(kind)) return null;
	try {
		return { image: await briefToPng(kind, date, day) };
	} catch (err) {
		const reason = screenshotFailureReason(err);
		logErr('print', `screenshot path failed for ${kind} (${reason}); falling back to canvas:`, err);
		const text = await composeText(kind, date, day);
		return { image: await renderReceiptPng(text ?? '', { masthead: true }), fallback: reason };
	}
}

function screenshotFailureReason(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	if (/ENOENT|not found|spawn/i.test(msg)) return 'agent-browser missing';
	if (/timeout|timed ?out/i.test(msg)) return 'agent-browser timeout';
	return 'screenshot error';
}
