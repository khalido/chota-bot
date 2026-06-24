/**
 * Stream an agent reply into a Telegram chat using Bot API 10.1 Rich Messages,
 * with a native "thinking" status while the agent runs tools.
 *
 * Streaming contract (https://core.telegram.org/bots/api#sendrichmessagedraft):
 *   - `sendRichMessageDraft` shows an EPHEMERAL ~30s live preview; re-sending
 *     with the same `draft_id` animates the update.
 *   - The draft does NOT persist — once done you MUST `sendRichMessage` the
 *     final content to leave it in the chat.
 *
 * We drive the agent's `fullStream` (not just textStream) so we can react to
 * tool calls: while the model is calling a tool (e.g. the calendar), the draft
 * shows a `<tg-thinking>` block ("Checking the calendar…") — the native Bot API
 * 10.1 thinking status, which is draft-only. Once text starts arriving we
 * switch the draft to the answer (Markdown). `InputRichMessage` takes a
 * `markdown`/`html` string directly, so the agent's Markdown flows through with
 * no hand-built block tree.
 *
 * Graceful fallback: if any rich method errors (a client/API that doesn't speak
 * 10.1 yet), we stop streaming drafts and send one plain `reply` with the final
 * text — the family always gets an answer.
 */
import type { Context } from 'grammy';
import type { ChotaStreamResult } from '$lib/server/agent';
import { logErr } from '$lib/server/log';

const SCOPE = 'telegram';
/** Min gap between draft edits — keep clear of Telegram's edit rate limits. */
const THROTTLE_MS = 1200;
const EMPTY_REPLY = "I didn't have anything to say to that.";

/** Friendly "thinking" status per tool name. Falls back to a generic line. */
const TOOL_STATUS: Record<string, string> = {
	weather: 'Checking the weather',
	calendar: 'Checking the calendar',
	ticktick: 'Looking at the lists',
	tmdb: 'Looking that up',
	google_search: 'Searching the web'
};

/** Escape for the `<tg-thinking>` HTML body (model reasoning is untrusted text). */
const escapeHtml = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A compact one-line view of streaming reasoning — collapse whitespace and
 *  show the tail so the status reads like a live thought, not a wall of text. */
function compactThought(text: string, max = 140): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > max ? `…${flat.slice(-max)}` : flat;
}

export async function streamRichReply(ctx: Context, result: ChotaStreamResult) {
	const chatId = ctx.chat?.id;
	if (chatId === undefined) return;

	const draftId = Date.now(); // non-zero, stable across this reply's updates
	let acc = '';
	let reasoning = '';
	let thinking = 'Thinking…'; // current <tg-thinking> body
	let answering = false;
	let lastFlush = 0;
	let richOk = true;

	/** Push the current state as a draft (thinking block, or the answer so far). */
	const flush = async (force = false) => {
		if (!richOk) return;
		const now = Date.now();
		if (!force && now - lastFlush < THROTTLE_MS) return;
		lastFlush = now;
		try {
			if (answering) {
				await ctx.api.sendRichMessageDraft(chatId, draftId, { markdown: acc });
			} else {
				await ctx.api.sendRichMessageDraft(chatId, draftId, {
					html: `<tg-thinking>${escapeHtml(thinking)}</tg-thinking>`
				});
			}
		} catch (err) {
			// One failure → this client/API can't do rich drafts. Stop trying;
			// the final plain reply carries the answer.
			richOk = false;
			logErr(SCOPE, 'sendRichMessageDraft failed; falling back to plain reply', err);
		}
	};

	for await (const part of result.fullStream) {
		switch (part.type) {
			// The model's thought summary, if it emits one (opportunistic — no
			// provider flag forces it) — show it streaming in the thinking block
			// as a live, compacted thought.
			case 'reasoning-delta':
				if (!answering) {
					reasoning += part.text;
					thinking = compactThought(reasoning);
					await flush();
				}
				break;
			// A tool is being called — a clearer status than raw reasoning, so
			// override the block with the friendly tool phrase.
			case 'tool-input-start':
				if (!answering) {
					thinking = `${TOOL_STATUS[part.toolName] ?? 'Working on it'}…`;
					await flush(true);
				}
				break;
			case 'text-delta':
				acc += part.text;
				if (!answering && acc.trim()) {
					answering = true;
					await flush(true); // first answer text replaces the thinking block
				} else {
					await flush();
				}
				break;
		}
	}

	const text = acc.trim() || EMPTY_REPLY;
	if (richOk) {
		try {
			await ctx.api.sendRichMessage(chatId, { markdown: text });
			return;
		} catch (err) {
			logErr(SCOPE, 'sendRichMessage failed; falling back to plain reply', err);
		}
	}
	await ctx.reply(text);
}
