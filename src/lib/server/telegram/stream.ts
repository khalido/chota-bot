/**
 * Stream an agent reply into a Telegram chat using Bot API 10.1 Rich Messages.
 *
 * The 10.1 streaming contract (https://core.telegram.org/bots/api#sendrichmessagedraft):
 *   - `sendRichMessageDraft` shows an EPHEMERAL ~30s live preview. Re-sending
 *     with the same `draft_id` animates the update — that's our "Chota typing".
 *   - The draft does NOT persist. Once generation is done you MUST call
 *     `sendRichMessage` with the full content to leave it in the chat.
 *
 * The agent emits Markdown, and `InputRichMessage` takes a `markdown` string
 * directly — Telegram parses it into rich blocks server-side, so we never
 * hand-build RichBlock trees.
 *
 * Graceful fallback: if the rich methods error (e.g. a client/API that doesn't
 * support 10.1 yet), we stop streaming drafts and send one plain `reply` with
 * the final text. The family always gets an answer.
 */
import type { Context } from 'grammy';
import { log, logErr } from '$lib/server/log';

const SCOPE = 'telegram';
/** Min gap between draft edits — keep clear of Telegram's edit rate limits. */
const THROTTLE_MS = 1200;
const EMPTY_REPLY = "I didn't have anything to say to that.";

export async function streamRichReply(ctx: Context, textStream: AsyncIterable<string>) {
	const chatId = ctx.chat?.id;
	if (chatId === undefined) return;

	// draft_id must be non-zero and stable across this reply's updates.
	const draftId = Date.now();
	let acc = '';
	let lastFlush = 0;
	let richOk = true;

	const flushDraft = async () => {
		try {
			await ctx.api.sendRichMessageDraft(chatId, draftId, { markdown: acc });
		} catch (err) {
			// One failure means this client/API can't do rich drafts — stop
			// trying and let the final plain reply carry the answer.
			richOk = false;
			log(SCOPE, 'rich drafts unsupported, falling back to plain reply');
			logErr(SCOPE, 'sendRichMessageDraft failed', err);
		}
	};

	for await (const chunk of textStream) {
		acc += chunk;
		const now = Date.now();
		// First non-empty chunk flushes immediately (lastFlush=0); then throttle.
		if (richOk && acc.trim() && now - lastFlush >= THROTTLE_MS) {
			lastFlush = now;
			await flushDraft();
		}
	}

	const text = acc.trim() || EMPTY_REPLY;

	if (richOk) {
		try {
			// Persist the final answer — the draft was ephemeral.
			await ctx.api.sendRichMessage(chatId, { markdown: text });
			return;
		} catch (err) {
			logErr(SCOPE, 'sendRichMessage failed, falling back to plain reply', err);
		}
	}

	await ctx.reply(text);
}
