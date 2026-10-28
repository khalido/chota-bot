/**
 * WhatsApp channel — baileyrs (Baileys API over the whatsapp-rust core, as
 * WASM) linked as a device of the bot's own WhatsApp Business number. Design
 * and the rules this follows: docs/whatsapp.md (§Spike findings).
 *
 * On only where `WHATSAPP_ENABLED=true` and `whatsapp.botNumber` is set: two
 * running connections on one login would each answer every message, so one
 * machine (the box) runs it.
 *
 * Linking: with no saved login it asks WhatsApp for a pairing code and sends
 * it as an alert (Telegram): type it on the bot phone under WhatsApp Business
 * → Linked devices → Link with phone number. The login lives in
 * `data/whatsapp-auth/` (the library's file store); back the folder up whole.
 *
 * Connection: a `close` means the socket is finished — build a new one,
 * except 401 (logged out: alert, stop) and 403 (temporary ban: wait it out).
 * `connecting` can last many minutes while the engine backs off; never
 * restart for that.
 */
import makeWASocket, {
	type ConnectionState,
	DisconnectReason,
	downloadMediaMessage,
	fetchLatestWaWebVersion,
	useMultiFileAuthState
} from '@oxidezap/baileyrs';
import { env } from '$env/dynamic/private';
import { getConfig } from '$lib/server/config';
import { clearAlert, raiseAlert, registerAlertChannel } from '$lib/server/alerts';
import { recordSent } from '$lib/server/agent/history';
import { errorMessage, log, logErr } from '$lib/server/log';
import { mediaOf, toIncoming, userOf, type WaMessage } from './whatsapp-message';
import { toWhatsApp } from './whatsapp-format';
import { FAILED, THINKING, toolEmoji, WRITE_TOOLS } from './reactions';
import type { Channel, Incoming, Outgoing } from './types';

const SCOPE = 'whatsapp';
const AUTH_DIR = 'data/whatsapp-auth';
const ALERT_KEY = 'whatsapp';

type Socket = ReturnType<typeof makeWASocket>;

/** Library logging: warnings and errors into ours; its info stream is chatty. */
const libLogger = {
	level: 'warn',
	child: () => libLogger,
	trace() {},
	debug() {},
	info() {},
	warn: (...a: unknown[]) => log(SCOPE, `lib: ${a.map((x) => JSON.stringify(x)).join(' ')}`),
	// Drops the engine retries itself ("Will retry", "reconnecting") are
	// routine: log them plainly, and keep errors for the rest.
	error: (...a: unknown[]) => {
		const text = a.map((x) => JSON.stringify(x)).join(' ');
		if (/WebSocket error|Will retry|reconnecting/.test(text)) log(SCOPE, `lib (retrying): ${text}`);
		else logErr(SCOPE, 'lib error', text);
	}
};

const jidOf = (threadId: string) => threadId.slice('wa:'.length);
const phoneJid = (e164: string) => `${e164.replace(/\D/g, '')}@s.whatsapp.net`;

/** The raw message behind each Incoming, for quoting and reactions — keyed by
 *  thread + message id (the router may hand back a copy of the Incoming). */
const raws = new Map<string, WaMessage>();
const rawKey = (m: Incoming) => `${m.threadId}|${m.messageId}`;
const RAW_KEEP = 200;
function keepRaw(m: Incoming, raw: WaMessage) {
	raws.set(rawKey(m), raw);
	if (raws.size > RAW_KEEP) raws.delete(raws.keys().next().value!);
}

export function whatsappChannel(): Channel | null {
	const configured = getConfig().whatsapp?.botNumber;
	if (env.WHATSAPP_ENABLED !== 'true' || !configured) {
		log(SCOPE, 'WhatsApp disabled (WHATSAPP_ENABLED / whatsapp.botNumber)');
		return null;
	}
	const botNumber: string = configured;
	let sock: Socket | undefined;
	let stopped = false;
	/** The alert key of the pairing code last sent — each code is its own
	 *  alert, so a fresh code after a restart isn't swallowed as a repeat. */
	let pairKey: string | undefined;
	let retry: ReturnType<typeof setTimeout> | undefined;

	const requireSock = () => {
		if (!sock) throw new Error('WhatsApp not connected');
		return sock;
	};

	const send = async (threadId: string, out: Outgoing) => {
		const s = requireSock();
		const jid = jidOf(threadId);
		if ('markdown' in out) await s.sendMessage(jid, { text: toWhatsApp(out.markdown) });
		else if ('image' in out) await s.sendMessage(jid, { image: out.image, caption: out.caption });
		else {
			await s.sendMessage(jid, {
				document: out.document,
				fileName: out.fileName,
				mimetype: out.mimetype ?? 'application/octet-stream'
			});
		}
	};

	let failures = 0;

	/** Connect after `delay`; a failed attempt (network down, version fetch)
	 *  tries again with backoff, and alerts from the second failure. */
	function scheduleConnect(onMessage: (m: Incoming) => Promise<void>, delay = 0) {
		clearTimeout(retry);
		retry = setTimeout(
			() => {
				connect(onMessage).catch(async (err) => {
					failures++;
					logErr(SCOPE, `connect failed (attempt ${failures})`, err);
					if (failures >= 2) {
						await raiseAlert(ALERT_KEY, `WhatsApp can't connect: ${errorMessage(err)}. Retrying.`);
					}
					if (!stopped) scheduleConnect(onMessage, Math.min(5_000 * 2 ** failures, 15 * 60_000));
				});
			},
			Math.min(delay, 2 ** 31 - 1)
		);
	}

	async function connect(onMessage: (m: Incoming) => Promise<void>) {
		const { state } = await useMultiFileAuthState(AUTH_DIR);
		// The bundled WA Web version is rejected (405); ask web.whatsapp.com.
		const { version } = await fetchLatestWaWebVersion();
		if (stopped) return; // stop() landed while we were getting ready
		log(SCOPE, `connecting (WA Web ${version.join('.')})`);
		const s = makeWASocket({ auth: state, logger: libLogger, version });
		sock = s;
		let askedCode = false;

		const onUpdate = async ({ connection, lastDisconnect, qr }: Partial<ConnectionState>) => {
			if (qr && !state.creds.registered && !askedCode) {
				askedCode = true;
				const code = await s.requestPairingCode(botNumber.replace(/\D/g, ''));
				const pretty = `${code.slice(0, 4)}-${code.slice(4)}`;
				log(SCOPE, `pairing code ${pretty}`);
				if (pairKey)
					await clearAlert(pairKey, { recovered: 'That WhatsApp code expired; a new one follows' });
				pairKey = `${ALERT_KEY}:pair:${code}`;
				await raiseAlert(
					pairKey,
					`WhatsApp needs linking. On the bot phone: WhatsApp Business → Linked devices → Link a device → Link with phone number, code ${pretty}`
				);
			}
			if (connection === 'open') {
				failures = 0;
				log(SCOPE, `connected as ${userOf(s.user?.id)}`);
				if (pairKey) await clearAlert(pairKey, { recovered: 'WhatsApp linked' });
				pairKey = undefined;
				await clearAlert(ALERT_KEY, { recovered: 'WhatsApp is connected again' });
			}
			if (connection !== 'close' || stopped) return;
			sock = undefined;
			const err = lastDisconnect?.error as
				| { output?: { statusCode?: number }; data?: { expire?: number }; message?: string }
				| undefined;
			const code = err?.output?.statusCode;
			log(SCOPE, `closed (${code ?? '?'}: ${err?.message ?? 'no reason'})`);
			if (code === DisconnectReason.loggedOut) {
				await raiseAlert(
					ALERT_KEY,
					`WhatsApp logged out (unlinked on the phone). Delete ${AUTH_DIR} and restart to re-link.`
				);
				return;
			}
			// Another connection on the same login took over — a second app
			// instance (the Mac and the box both linked, or a dev reload). Fighting
			// back makes the two kick each other off every few seconds.
			if (code === DisconnectReason.connectionReplaced) {
				await raiseAlert(
					ALERT_KEY,
					'WhatsApp connection replaced by another instance — this one stopped. Restart it if that was wrong.'
				);
				return;
			}
			// A plain close usually reconnects at once — only a failed reconnect
			// alerts (scheduleConnect). A temporary ban waits until it lifts.
			if (code === DisconnectReason.forbidden) {
				const until = (err?.data?.expire ?? 0) * 1000;
				await raiseAlert(
					ALERT_KEY,
					`WhatsApp temporarily banned until ${new Date(until).toISOString()}`
				);
			}
			const banUntil = code === DisconnectReason.forbidden ? (err?.data?.expire ?? 0) * 1000 : 0;
			if (!stopped) scheduleConnect(onMessage, Math.max(5_000, banUntil - Date.now()));
		};
		// The library doesn't await listeners: catch here, or a throw (say the
		// pairing-code request) is an unhandled rejection.
		s.ev.on('connection.update', (u) => {
			onUpdate(u).catch((err) => logErr(SCOPE, 'connection update failed', err));
		});

		s.ev.on('messages.upsert', ({ messages, type }) => {
			const bot = { phone: userOf(s.user?.id), lid: userOf(s.user?.lid) };
			const family = getConfig().family ?? [];
			for (const raw of messages) {
				const m = toIncoming(raw as WaMessage, type, bot, family);
				if (!m) continue;
				const media = raw.message ? mediaOf(raw.message as Record<string, unknown>) : undefined;
				if (media) {
					m.media = {
						...media,
						download: () => downloadMediaMessage(raw, 'buffer', {}) as Promise<Buffer>
					};
				}
				keepRaw(m, raw as WaMessage);
				onMessage(m).catch((err) => logErr(SCOPE, 'message handling failed', err));
			}
		});
	}

	return {
		name: 'whatsapp',
		send,

		async start(onMessage) {
			registerAlertChannel('whatsapp', async (text) => {
				const to = getConfig().whatsapp?.notify ?? [];
				if (!to.length) throw new Error('no whatsapp.notify configured');
				for (const n of to) {
					await requireSock().sendMessage(phoneJid(n), { text });
					recordSent(`wa:${phoneJid(n)}`, text);
				}
			});
			scheduleConnect(onMessage);
		},

		async stop() {
			stopped = true;
			clearTimeout(retry);
			sock?.end(undefined);
			sock = undefined;
		},

		async reply(m, result) {
			// No edit-streaming on WhatsApp: a reaction on their message tracks the
			// work (🤔, then each tool's emoji), typing… runs alongside, then one
			// message and the reaction clears. 💔 stays if it failed.
			const react = (emoji: string) => this.react?.(m, emoji).catch(() => {});
			// A quiet (triaged) turn shows nothing until it changes a list.
			if (!m.triage) await react(THINKING);
			try {
				let wrote: string | undefined;
				for await (const part of result.fullStream) {
					// ai v7 streams a provider failure as a part; throw it so the
					// router sees the real error.
					if (part.type === 'error') throw part.error;
					if (part.type !== 'tool-input-start') continue;
					if (WRITE_TOOLS.has(part.toolName)) wrote = part.toolName;
					if (!m.triage || WRITE_TOOLS.has(part.toolName)) await react(toolEmoji(part.toolName));
				}
				// A triaged message gets no message — the write's emoji stays as the
				// answer (✍️ added, ✅ ticked off); lookups only leave no trace.
				if (m.triage) {
					if (!wrote) await react('');
					return;
				}
				const text = (await result.text).trim();
				if (!text) {
					await react('');
					return;
				}
				const quoted = m.isDM ? undefined : raws.get(rawKey(m));
				await requireSock().sendMessage(
					jidOf(m.threadId),
					{ text: toWhatsApp(text) },
					quoted ? { quoted: quoted as never } : undefined
				);
				await react('');
			} catch (err) {
				await react(m.triage ? '' : FAILED);
				throw err;
			}
		},

		typing(m) {
			const jid = jidOf(m.threadId);
			const ping = () => sock?.sendPresenceUpdate('composing', jid).catch(() => {});
			ping();
			const timer = setInterval(ping, 10_000);
			return () => {
				clearInterval(timer);
				sock?.sendPresenceUpdate('paused', jid).catch(() => {});
			};
		},

		async react(m, emoji) {
			const raw = raws.get(rawKey(m));
			if (raw)
				await requireSock().sendMessage(jidOf(m.threadId), {
					react: { text: emoji, key: raw.key as never }
				});
		}
	};
}
