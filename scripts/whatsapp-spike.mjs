/**
 * WhatsApp spike on baileyrs — link the bot's number, send a message, echo
 * replies, and log who sent each message (the phone number vs LID question).
 * Not wired into the app; see docs/whatsapp.md §Spike.
 *
 * Usage (numbers as digits with country code, no +; they stay out of the repo):
 *   node scripts/whatsapp-spike.mjs <botNumber> <yourNumber>
 *
 * First run prints an 8-character pairing code. On the bot's phone: WhatsApp
 * Business → Linked devices → Link a device → "Link with phone number instead",
 * and type it in. The login is saved to data/whatsapp-auth/ (gitignored), so
 * later runs reconnect without pairing. Lines starting "SPIKE" are ours; the
 * library only logs warnings and errors.
 */
import makeWASocket, {
	DisconnectReason,
	fetchLatestWaWebVersion,
	useMultiFileAuthState
} from '@oxidezap/baileyrs';
import { readFile } from 'node:fs/promises';

const [bot, to] = process.argv.slice(2);
if (!/^\d{8,15}$/.test(bot ?? '') || !/^\d{8,15}$/.test(to ?? '')) {
	console.error('usage: node scripts/whatsapp-spike.mjs <botNumber> <yourNumber>  (digits only)');
	process.exit(1);
}
const toJid = `${to}@s.whatsapp.net`;
const say = (...a) => console.log('SPIKE', new Date().toISOString().slice(11, 19), ...a);

/** warn and above only — the library's info stream is very chatty. */
const logger = {
	level: 'warn',
	child() {
		return logger;
	},
	trace() {},
	debug() {},
	info() {},
	warn: (...a) => console.error('lib warn', ...a.map((x) => JSON.stringify(x))),
	error: (...a) => console.error('lib error', ...a.map((x) => JSON.stringify(x)))
};

/** "61400000000:1@s.whatsapp.net" → "61400000000" — drop the device suffix and server. */
const userOf = (jid) => jid?.split('@')[0].split(':')[0];
const mentionsOf = (m) =>
	m.message?.extendedTextMessage?.contextInfo?.mentionedJid ??
	m.message?.imageMessage?.contextInfo?.mentionedJid ??
	[];

const textOf = (m) =>
	m.message?.conversation ??
	m.message?.extendedTextMessage?.text ??
	m.message?.imageMessage?.caption ??
	null;

const { state, saveCreds } = await useMultiFileAuthState('data/whatsapp-auth');
// Say hello only on first pairing, not on every restart.
let greeted = Boolean(state.creds.registered);
// The bundled default version gets 405 "Client outdated"; ask web.whatsapp.com.
const { version } = await fetchLatestWaWebVersion();

async function connect() {
	const sock = makeWASocket({ auth: state, logger, version });
	sock.ev.on('creds.update', saveCreds);
	let asked = false;

	sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
		if (qr && !state.creds.registered && !asked) {
			asked = true;
			const code = await sock.requestPairingCode(bot);
			say(`PAIRING CODE: ${code.slice(0, 4)}-${code.slice(4)}`);
		}
		if (connection) say('connection', connection);
		if (connection === 'open') {
			say('linked as', JSON.stringify(sock.user));
			if (!greeted) {
				greeted = true;
				await sock.sendMessage(toJid, {
					text: 'Hi from chota (WhatsApp spike). Reply and I echo it.'
				});
				say('sent hello to', toJid);
			}
		}
		if (connection === 'close') {
			const code = lastDisconnect?.error?.output?.statusCode;
			say('closed', code, lastDisconnect?.error?.message);
			if (code === DisconnectReason.loggedOut || code === 405) {
				say('stopping: needs a fresh pairing (delete data/whatsapp-auth) or a newer build');
				process.exit(1);
			}
			setTimeout(connect, 5_000);
		}
	});

	sock.ev.on('messages.upsert', async ({ messages, type }) => {
		for (const m of messages) {
			const k = m.key;
			say(
				'msg',
				JSON.stringify({
					type,
					fromMe: k.fromMe,
					remoteJid: k.remoteJid,
					remoteJidAlt: k.remoteJidAlt,
					participant: k.participant,
					participantAlt: k.participantAlt,
					pushName: m.pushName,
					ts: Number(m.messageTimestamp),
					text: textOf(m),
					kinds: Object.keys(m.message ?? {}),
					contact: m.message?.contactMessage?.vcard
						?.match(/waid=(\d+)|TEL[^:]*:([+\d ]+)/)
						?.slice(1)
						.find(Boolean),
					mentions: mentionsOf(m)
				})
			);
			if (type !== 'notify' || k.fromMe) continue;
			const text = textOf(m);
			if (!text) continue;
			const isGroup = k.remoteJid?.endsWith('@g.us');
			// The bot may be mentioned by phone number or by LID — check both.
			const me = new Set([userOf(sock.user?.id), userOf(sock.user?.lid)]);
			const mentioned = mentionsOf(m).some((j) => me.has(userOf(j)));
			if (isGroup && !mentioned) continue;
			if (/\bpng\b/i.test(text)) {
				const image = await readFile('data/morning/brief-family.png');
				await sock.sendMessage(k.remoteJid, { image, caption: 'family brief (image)' });
				await sock.sendMessage(k.remoteJid, {
					document: image,
					mimetype: 'image/png',
					fileName: 'brief-family.png'
				});
				say('sent png as image + document');
			} else {
				await sock.sendMessage(
					k.remoteJid,
					{ text: `echo${isGroup ? ' (mentioned)' : ''}: ${text}` },
					{ quoted: m }
				);
			}
		}
	});
}

say('WA Web version', version.join('.'));
say(state.creds.registered ? 'saved login found — reconnecting' : 'no login yet — will pair');
await connect();
