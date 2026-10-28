/**
 * A baileyrs message → `Incoming`, or null when the bot shouldn't see it.
 * Pure, so the identity rules (docs/whatsapp.md §Spike findings) are tested
 * without a socket:
 *
 * - Senders arrive as LIDs (`…@lid`); the phone JID rides in `remoteJidAlt`
 *   (DM) / `participantAlt` (group). We match the phone against
 *   `family[].whatsapp`; no match → null (fail closed).
 * - DM threads key on the phone JID, not the LID, so history survives a LID
 *   change. Groups key on the group JID.
 * - A mention of the bot carries its LID (or phone); a reply to one of the
 *   bot's messages counts as a mention too. `@<digits>` for the bot in the
 *   text becomes `@chota`.
 * - `fromMe` (sent from the bot's own phone) is skipped; `append` means it
 *   arrived late, after a reconnect.
 */
import type { FamilyMember } from '$lib/config';
import type { Incoming } from './types';

/** The parts of a baileyrs WAMessage we read. */
export interface WaMessage {
	key: {
		id?: string | null;
		remoteJid?: string | null;
		remoteJidAlt?: string | null;
		participant?: string | null;
		participantAlt?: string | null;
		fromMe?: boolean | null;
	};
	pushName?: string | null;
	messageTimestamp?: number | { toNumber(): number } | null;
	message?: Record<string, unknown> | null;
}

/** "61400000000:1@s.whatsapp.net" → "61400000000" */
export const userOf = (jid?: string | null) => jid?.split('@')[0].split(':')[0] ?? '';

const digits = (phone: string) => phone.replace(/\D/g, '');

interface ContextInfo {
	mentionedJid?: string[] | null;
	participant?: string | null;
	stanzaId?: string | null;
}

/** A document sent with a caption arrives wrapped one level deeper. */
function unwrapDocument(message: Record<string, unknown>): Record<string, unknown> {
	const wrapped = message.documentWithCaptionMessage as
		{ message?: Record<string, unknown> } | undefined;
	return wrapped?.message ?? message;
}

function textAndContext(raw: Record<string, unknown>): { text: string; ctx?: ContextInfo } {
	const message = unwrapDocument(raw);
	const conv = message.conversation;
	if (typeof conv === 'string') return { text: conv };
	for (const k of ['extendedTextMessage', 'imageMessage', 'videoMessage', 'documentMessage']) {
		const part = message[k] as { text?: string; caption?: string; contextInfo?: ContextInfo };
		if (part) return { text: part.text ?? part.caption ?? '', ctx: part.contextInfo ?? undefined };
	}
	return { text: '' };
}

/** Which attachment, if any, a message carries (photo, voice note, document). */
export function mediaOf(
	raw: Record<string, unknown>
): { kind: 'image' | 'audio' | 'document'; mimetype: string; fileName?: string } | undefined {
	const message = unwrapDocument(raw);
	const doc = message.documentMessage as { mimetype?: string; fileName?: string } | undefined;
	if (doc) {
		return {
			kind: 'document',
			mimetype: doc.mimetype ?? 'application/octet-stream',
			fileName: doc.fileName ?? undefined
		};
	}
	const image = message.imageMessage as { mimetype?: string } | undefined;
	if (image) return { kind: 'image', mimetype: image.mimetype ?? 'image/jpeg' };
	const audio = message.audioMessage as { mimetype?: string } | undefined;
	if (audio) return { kind: 'audio', mimetype: audio.mimetype ?? 'audio/ogg' };
	return undefined;
}

export function toIncoming(
	m: WaMessage,
	type: 'notify' | 'append' | string,
	bot: { phone: string; lid: string },
	family: FamilyMember[]
): Incoming | null {
	const k = m.key;
	if (k.fromMe || !k.remoteJid || !m.message) return null;
	const isGroup = k.remoteJid.endsWith('@g.us');
	if (!isGroup && !k.remoteJid.endsWith('@lid') && !k.remoteJid.endsWith('@s.whatsapp.net')) {
		return null; // status broadcasts, newsletters
	}
	// The address and its "alt" are the LID and phone forms, in either order:
	// take whichever is the phone JID.
	const candidates = isGroup ? [k.participant, k.participantAlt] : [k.remoteJid, k.remoteJidAlt];
	const senderPhone = userOf(candidates.find((j) => j?.endsWith('@s.whatsapp.net')));
	const person = family.find((p) => p.whatsapp && digits(p.whatsapp) === senderPhone) ?? null;
	if (!person) return null;

	const { text, ctx } = textAndContext(m.message);
	const me = new Set([bot.phone, bot.lid].filter(Boolean));
	const mentioned = (ctx?.mentionedJid ?? []).some((j) => me.has(userOf(j)));
	const repliedToBot = ctx?.participant ? me.has(userOf(ctx.participant)) : false;
	// Only from ids we know — an empty one would match every "@word".
	const ids = [bot.lid, bot.phone].filter(Boolean);
	const clean = ids.length
		? text.replace(new RegExp(`@(${ids.join('|')})\\b`, 'g'), '@chota')
		: text;
	const ts = m.messageTimestamp;
	const seconds = typeof ts === 'number' ? ts : (ts?.toNumber() ?? Date.now() / 1000);

	return {
		threadId: isGroup ? `wa:${k.remoteJid}` : `wa:${senderPhone}@s.whatsapp.net`,
		channel: 'whatsapp',
		messageId: k.id ?? '',
		person,
		senderName: m.pushName ?? person.name,
		text: clean,
		isDM: !isGroup,
		isMention: mentioned || repliedToBot,
		catchUp: type === 'append',
		sentAt: new Date(seconds * 1000)
	};
}
