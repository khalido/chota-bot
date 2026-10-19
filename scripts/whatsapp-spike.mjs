/**
 * WhatsApp spike on baileyrs — link the bot's number, send a message, echo
 * replies, and log who sent each message (the phone number vs LID question).
 * Not wired into the app; see docs/whatsapp.md §Spike.
 *
 * Usage (numbers as digits with country code, no +; they stay out of the repo):
 *   node scripts/whatsapp-spike.mjs <botNumber> <yourNumber>
 *   node scripts/whatsapp-spike.mjs <botNumber> <toNumber|groupJid> --send <file>
 *     (one message from a text file, then exit; stop the echo run first —
 *     two connections on one login fight each other)
 *
 * First run prints an 8-character pairing code. On the bot's phone: WhatsApp
 * Business → Linked devices → Link a device → "Link with phone number instead",
 * and type it in. The login is saved to data/whatsapp-auth/ (gitignored), so
 * later runs reconnect without pairing. Lines starting "SPIKE" are ours; the
 * library only logs warnings and errors.
 */
import makeWASocket, {
	DisconnectReason,
	downloadMediaMessage,
	fetchLatestWaWebVersion,
	useMultiFileAuthState
} from '@oxidezap/baileyrs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const [bot, to] = process.argv.slice(2);
const sendFile = process.argv.includes('--send')
	? process.argv[process.argv.indexOf('--send') + 1]
	: null;
if (!/^\d{8,15}$/.test(bot ?? '') || !/^(\d{8,15}|\d+@g\.us)$/.test(to ?? '')) {
	console.error('usage: node scripts/whatsapp-spike.mjs <botNumber> <yourNumber>  (digits only)');
	process.exit(1);
}
const toJid = to.includes('@') ? to : `${to}@s.whatsapp.net`;
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

const MEDIA = ['imageMessage', 'audioMessage', 'videoMessage', 'documentMessage'];

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
			if (sendFile?.endsWith('.png')) {
				const caption = process.argv.includes('--caption')
					? process.argv[process.argv.indexOf('--caption') + 1]
					: undefined;
				await sock.sendMessage(toJid, { image: await readFile(sendFile), caption });
				say('sent image to', toJid);
				setTimeout(() => process.exit(0), 3_000);
				return;
			}
			if (/\.(html|svg)$/.test(sendFile ?? '')) {
				// As a document: does the phone open it, and does its JS run?
				const document = await readFile(sendFile);
				const fileName = sendFile.split('/').pop();
				const mimetype = sendFile.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
				await sock.sendMessage(toJid, { document, mimetype, fileName });
				say('sent', fileName, 'to', toJid);
				setTimeout(() => process.exit(0), 3_000);
				return;
			}
			if (sendFile) {
				const text = (await readFile(sendFile, 'utf8')).trim();
				await sock.sendMessage(toJid, { text });
				say('sent', text.length, 'chars to', toJid);
				setTimeout(() => process.exit(0), 3_000); // let the send flush
				return;
			}
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
			const isGroup = k.remoteJid?.endsWith('@g.us');
			// Keep everything family members send — ideas for the bot. Media goes
			// to data/files/<chat>/ (images, voice notes) for later.
			const kind = MEDIA.find((t) => m.message?.[t]);
			let file = null;
			if (kind) {
				try {
					const buf = await downloadMediaMessage(m, 'buffer', {});
					const ext = {
						imageMessage: 'jpg',
						audioMessage: 'ogg',
						videoMessage: 'mp4',
						documentMessage: 'bin'
					}[kind];
					// One folder per chat: a person's DMs, or the group.
					const dir = `data/files/${isGroup ? `group-${userOf(k.remoteJid)}` : `dm-${userOf(k.remoteJidAlt ?? k.remoteJid)}`}`;
					await mkdir(dir, { recursive: true });
					file = `${dir}/${Number(m.messageTimestamp)}-${k.id}.${ext}`;
					await writeFile(file, buf);
					say('saved', kind, file, buf.length, 'bytes');
				} catch (err) {
					say('media download failed', kind, err?.message);
				}
			}
			await appendFile(
				'data/whatsapp-inbox.jsonl',
				JSON.stringify({
					at: new Date(Number(m.messageTimestamp) * 1000).toISOString(),
					chat: isGroup ? 'group' : 'dm',
					from: m.pushName,
					phone: userOf(k.participantAlt ?? k.remoteJidAlt),
					text: textOf(m),
					kind: kind ?? null,
					file
				}) + '\n'
			);
			const text = textOf(m);
			// The bot may be mentioned by phone number or by LID — check both.
			const me = new Set([userOf(sock.user?.id), userOf(sock.user?.lid)]);
			const mentioned = mentionsOf(m).some((j) => me.has(userOf(j)));
			if (isGroup && !mentioned) continue;
			if (text && /\bpng\b/i.test(text)) {
				const image = await readFile('data/morning/brief-family.png');
				await sock.sendMessage(k.remoteJid, { image, caption: 'family brief (image)' });
				say('sent png');
				continue;
			}
			// Addressed (a DM, or @chota in the group): acknowledge with a reaction.
			await sock.sendMessage(k.remoteJid, { react: { text: '👍', key: k } });
		}
	});
}

say('WA Web version', version.join('.'));
say(state.creds.registered ? 'saved login found — reconnecting' : 'no login yet — will pair');
await connect();
