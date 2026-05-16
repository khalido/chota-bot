/**
 * Registry of printable "kinds" → their plain-text payload.
 *
 * The plain text is the canonical, debuggable form; the image print path
 * (`renderReceiptPng`) and the styled `/print/<who>` page also render the
 * morning data, so there's one source of truth per recipient.
 *
 * Kinds:
 *   - `test`            — the ruler smoke-test sheet
 *   - `morning`/`family`— the family Daily Shout
 *   - `<kid>`           — a recipient brief (family sections + their school day)
 */
import { gatherMorning } from './morning';
import { recipientToSections, sectionsToText, getRecipients } from './sections';
import { getSchedule } from '$lib/server/tools/sentral';
import { briefToPng } from './snapshot';
import { renderReceiptPng } from './render';
import { logErr } from '$lib/server/log';

/** Printable URL kinds = the static specials + every recipient (one per kid + `family`). */
export function getPrintKinds(): readonly string[] {
	return ['morning', 'test', ...getRecipients()];
}

/** `morning` is an alias for the `family` brief; everything else maps to itself. */
function recipientOf(kind: string): string {
	return kind === 'morning' ? 'family' : kind;
}

function isRecipient(who: string): boolean {
	return getRecipients().includes(who);
}

/** Title-cased recipient name for the plain-text masthead, or undefined for the family brief. */
function recipientName(who: string): string | undefined {
	return who === 'family' ? undefined : who[0].toUpperCase() + who.slice(1);
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
 * Returns the plain-text payload for `kind`, or null if unknown. `morning` ≡
 * `family`. `date` (YYYY-MM-DD) overrides the school-timetable day — lets you
 * reprint a past day's schedule; omitted → today.
 */
export async function composeText(kind: string, date?: string): Promise<string | null> {
	if (kind === 'test') return testSheet();
	const who = recipientOf(kind);
	if (!isRecipient(who)) return null;
	const d = await gatherMorning();
	const schedule = who === 'family' ? [] : await getSchedule(who, date);
	return sectionsToText(d.date, recipientToSections(who, d, schedule), d.closing, recipientName(who));
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

export async function composeImage(kind: string, date?: string): Promise<ComposedImage | null> {
	if (kind === 'test') return { image: await renderReceiptPng(testSheet(), {}) };
	const who = recipientOf(kind);
	if (!isRecipient(who)) return null;
	try {
		return { image: await briefToPng(who, date) };
	} catch (err) {
		const reason = screenshotFailureReason(err);
		logErr('print', `screenshot path failed for ${who} (${reason}); falling back to canvas:`, err);
		const text = await composeText(kind, date);
		return { image: await renderReceiptPng(text ?? '', { masthead: true }), fallback: reason };
	}
}

function screenshotFailureReason(err: unknown): string {
	const msg = err instanceof Error ? err.message : String(err);
	if (/ENOENT|not found|spawn/i.test(msg)) return 'agent-browser missing';
	if (/timeout|timed ?out/i.test(msg)) return 'agent-browser timeout';
	return 'screenshot error';
}
