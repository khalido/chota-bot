/**
 * Alerts — tell someone when something breaks, once, and when it's fixed.
 *
 *   await raiseAlert('printer', 'Printer: paper out');
 *   await clearAlert('printer', { okNeeded: 2 });
 *
 * One row per key in the `alert` table. `raiseAlert` sends the first time a
 * key opens, then stays quiet while it's still open, repeating only after
 * REPEAT_MS. `clearAlert` closes it after `okNeeded` good checks in a row and
 * sends "back to normal" only if the problem was actually sent. Every alert
 * is also logged; the table is just the send/no-send state.
 *
 * Delivery goes through a channel the transport registers at boot
 * (`registerAlertChannel('telegram', …)` in channels/telegram.ts), so this module
 * doesn't import the bot. It tries `alerts.channel` (else `channels.default`),
 * then `channels.fallback`. During `alerts.quietHours` messages go out silent.
 * Alerting never throws: a broken channel must not fail the job that called it.
 */
import { eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.ts';
import { alert } from '#lib/server/db/schema.ts';
import { getConfig } from '#lib/server/config.ts';
import { log, logErr } from '#lib/server/log.ts';
import { sydneyHHMM } from '#lib/time.ts';

const SCOPE = 'alerts';
/** A still-open problem is re-sent after this long. */
const REPEAT_MS = 12 * 60 * 60_000;

export type AlertSend = (text: string, opts: { silent: boolean }) => Promise<void>;
const channels = new Map<string, AlertSend>();

/** Called by a transport at boot (Telegram now, WhatsApp later). */
export function registerAlertChannel(name: string, send: AlertSend) {
	channels.set(name, send);
}

/** Is `hhmm` inside a from–to span? Spans may wrap midnight (21:00–07:00). */
export function inQuietHours(hhmm: string, quiet?: { from: string; to: string }): boolean {
	if (!quiet) return false;
	const { from, to } = quiet;
	return from <= to ? hhmm >= from && hhmm < to : hhmm >= from || hhmm < to;
}

/** Send on the alert channel, then the fallback channel if that fails. */
async function send(text: string, now: Date): Promise<boolean> {
	const cfg = getConfig();
	const silent = inQuietHours(sydneyHHMM(now), cfg.alerts?.quietHours);
	const order = [
		cfg.alerts?.channel ?? cfg.channels?.default ?? 'telegram',
		cfg.channels?.fallback
	];
	for (const name of new Set(order)) {
		if (!name) continue;
		const channel = channels.get(name);
		if (!channel) {
			log(SCOPE, `alert channel ${name} not registered`);
			continue;
		}
		try {
			await channel(text, { silent });
			return true;
		} catch (err) {
			logErr(SCOPE, `alert send on ${name} failed`, err);
		}
	}
	log(SCOPE, `alert not sent: ${text}`);
	return false;
}

/** Open (or keep open) a problem under `key`, sending it if it's news.
 *  Resolves true when a message went out on this call. */
export async function raiseAlert(key: string, text: string, now = new Date()): Promise<boolean> {
	try {
		const row = db.select().from(alert).where(eq(alert.key, key)).get();
		const isNew = !row || row.status === 'resolved';
		const due = isNew || !row.sentAt || now.getTime() - row.sentAt.getTime() >= REPEAT_MS;
		log(SCOPE, `${isNew ? 'opened' : 'still open'} ${key}: ${text}`);
		const sent = due && (await send(isNew ? `⚠️ ${text}` : `⚠️ Still: ${text}`, now));
		const sentAt = sent ? now : isNew ? null : (row.sentAt ?? null);
		const openedAt = isNew ? now : row.openedAt;
		db.insert(alert)
			.values({ key, status: 'open', text, openedAt, sentAt, okStreak: 0, resolvedAt: null })
			.onConflictDoUpdate({
				target: alert.key,
				set: { status: 'open', text, openedAt, sentAt, okStreak: 0, resolvedAt: null }
			})
			.run();
		return sent;
	} catch (err) {
		logErr(SCOPE, `raiseAlert ${key} failed`, err);
		return false;
	}
}

/**
 * Send every open alert that never went out: the send failed (Wi-Fi down, a
 * channel outage, the channel not registered yet at boot). Without this the
 * key is only raised again if the job fails again, and its next ok run closes
 * it without a word. Called from the job-check tick. Resolves how many it sent.
 */
export async function resendUnsent(now = new Date()): Promise<number> {
	let sentCount = 0;
	try {
		const rows = db.select().from(alert).where(eq(alert.status, 'open')).all();
		for (const row of rows) {
			if (row.sentAt) continue;
			if (!(await send(`⚠️ ${row.text}`, now))) break; // still down: try next tick
			db.update(alert).set({ sentAt: now }).where(eq(alert.key, row.key)).run();
			sentCount++;
		}
	} catch (err) {
		logErr(SCOPE, 'resendUnsent failed', err);
	}
	return sentCount;
}

/**
 * Record a good check for `key`. Closes an open alert after `okNeeded` in a
 * row (2+ for a device that flaps) and sends `recovered` if the problem was
 * sent. A no-op, one primary-key read, when nothing is open.
 */
export async function clearAlert(
	key: string,
	{ okNeeded = 1, recovered }: { okNeeded?: number; recovered?: string } = {},
	now = new Date()
): Promise<void> {
	try {
		const row = db.select().from(alert).where(eq(alert.key, key)).get();
		if (!row || row.status !== 'open') return;
		const okStreak = row.okStreak + 1;
		if (okStreak < okNeeded) {
			db.update(alert).set({ okStreak }).where(eq(alert.key, key)).run();
			return;
		}
		db.update(alert)
			.set({ status: 'resolved', okStreak, resolvedAt: now })
			.where(eq(alert.key, key))
			.run();
		log(SCOPE, `resolved ${key}`);
		if (row.sentAt) await send(`✅ ${recovered ?? `Back to normal: ${row.text}`}`, now);
	} catch (err) {
		logErr(SCOPE, `clearAlert ${key} failed`, err);
	}
}
