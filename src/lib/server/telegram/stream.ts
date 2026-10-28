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
import { finalText, type ChotaStreamResult } from '$lib/server/agent';
import { logErr } from '$lib/server/log';

const SCOPE = 'telegram';
/** Min gap between draft updates. Tokens arrive every few ms; sending each
 *  would be dozens of API calls a second and hit Telegram's rate limits. */
const DRAFT_GAP_MS = 300;

/** Friendly "thinking" status per tool name. Falls back to a generic line. */
const TOOL_STATUS: Record<string, string> = {
	weather: 'Checking the weather',
	calendar: 'Checking the calendar',
	ticktick: 'Looking at the lists',
	ticktick_add: 'Adding to the list',
	ticktick_done: 'Ticking it off',
	bus: 'Checking the buses',
	chores: 'Checking the chores',
	school_day: 'Checking the timetable',
	school_dates: 'Checking the school calendar',
	title_info: 'Looking that up',
	watch_ideas: 'Finding ideas',
	book: 'Looking up the book',
	save: 'Saving it',
	saved: 'Looking through what we saved',
	web_search: 'Searching the web',
	web_fetch: 'Reading the page'
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
	let richOk = true;

	// Draft sends run alongside the stream instead of blocking it. At most one
	// is in flight; changes made meanwhile go out in the next send, at most one
	// per DRAFT_GAP_MS.
	let pending = false;
	let lastSend = 0;
	let inFlight: Promise<void> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;

	const sendDraft = async () => {
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

	const pump = (now = false) => {
		if (!pending || inFlight || !richOk) return;
		const wait = now ? 0 : lastSend + DRAFT_GAP_MS - Date.now();
		if (wait > 0) {
			timer ??= setTimeout(() => {
				timer = undefined;
				pump();
			}, wait);
			return;
		}
		clearTimeout(timer);
		timer = undefined;
		pending = false;
		lastSend = Date.now();
		inFlight = sendDraft().finally(() => {
			inFlight = undefined;
			pump();
		});
	};

	/** Mark the draft changed; `now` skips the gap (status changes, first text)
	 *  unless a send is already running — then it follows that one. */
	const flush = (now = false) => {
		pending = true;
		pump(now);
	};

	try {
		for await (const part of result.fullStream) {
			switch (part.type) {
				// The model's thought summary, if it emits one (opportunistic — no
				// provider flag forces it) — show it streaming in the thinking block
				// as a live, compacted thought.
				case 'reasoning-delta':
					if (!answering) {
						reasoning += part.text;
						thinking = compactThought(reasoning);
						flush();
					}
					break;
				// A tool is being called — a clearer status than raw reasoning, so
				// override the block with the friendly tool phrase.
				case 'tool-input-start':
					if (!answering) {
						thinking = `${TOOL_STATUS[part.toolName] ?? 'Working on it'}…`;
						flush(true);
					}
					break;
				case 'text-delta':
					acc += part.text;
					if (!answering && acc.trim()) {
						answering = true;
						flush(true); // first answer text replaces the thinking block
					} else {
						flush();
					}
					break;
				// ai v7 puts a provider failure in the stream instead of throwing:
				// throw it, so no partial answer is posted and the router gets the
				// real error for its message.
				case 'error':
					throw part.error;
			}
		}
	} finally {
		// Drop any queued draft and let a running one land first, so a late
		// draft can't arrive after the final message (or after an error).
		clearTimeout(timer);
		pending = false;
		await inFlight;
	}

	// The last step's text, the same text the router keeps and checks: an empty
	// one sends nothing here, and the router says so once. Rejects if the run
	// failed, so the router's error message is the only one.
	const text = await finalText(result);
	if (!text) return;
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
