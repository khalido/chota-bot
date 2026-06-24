/**
 * Telegram bot — text→agent chat + on-demand brief prints (Phase 3).
 *
 * Long polling (not webhooks): `bot.start()` runs an outbound `getUpdates`
 * loop inside this same Node process — NAT-friendly, no public URL, no second
 * service. See docs/telegram.md for the full design.
 *
 * Boot gate: we start whenever TELEGRAM_BOT_TOKEN is set. The hard rule is
 * ONE POLLER PER TOKEN — two processes calling getUpdates on the same token
 * (your Mac + the box) cause 409 conflicts. Locally use a throwaway dev token;
 * the box's .env carries the real one.
 *
 * Auth: a middleware drops everything from chat IDs not in
 * chota.config.ts > telegram.allowedChatIds, except `/start` (so anyone can
 * fetch their chat ID to be added). No LLM moderation for inbound.
 *
 * Handlers:
 *   - /start  — greet + hand back the chat ID for onboarding
 *   - /print  — send a brief PNG (the same image the printer renders); with no
 *               arg, shows an inline keyboard of recipients
 *   - text    — stream an AI reply as a Bot API 10.1 Rich Message
 */
import { Bot, InputFile, InlineKeyboard, GrammyError, HttpError, type Context } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { env } from '$env/dynamic/private';
import { getConfig } from '$lib/server/config';
import { runAgentStream } from '$lib/server/agent';
import { composeImage } from '$lib/server/print/composers';
import { getRecipients, FAMILY_RECIPIENT } from '$lib/server/print/sections';
import { streamRichReply } from './stream';
import { event, log, logErr } from '$lib/server/log';

const SCOPE = 'telegram';

/** Module-level singleton so HMR / double init never starts two pollers. */
let bot: Bot | undefined;

/** In-flight message handlers — `bot.stop()` doesn't wait for middleware, so we
 *  drain these on shutdown to let a streaming agent run finish before the
 *  process (and logging) goes down on a deploy SIGTERM. */
const inFlight = new Set<Promise<void>>();

function isAllowed(chatId: number | undefined): boolean {
	if (chatId === undefined) return false;
	return (getConfig().telegram?.allowedChatIds ?? []).includes(chatId);
}

/** Title-case a recipient slug for display: `savi` → `Savi`, `family` → `Family`. */
const titleCase = (who: string) => who.charAt(0).toUpperCase() + who.slice(1);

/** Valid print recipients: each configured person + the whole-family sheet. */
const printRecipients = () => [...getRecipients(), FAMILY_RECIPIENT];

/** Render a recipient's brief PNG (same image the printer uses) and send it. */
async function sendBrief(ctx: Context, who: string) {
	await ctx.replyWithChatAction('upload_photo');
	const composed = await composeImage(who);
	if (!composed) {
		await ctx.reply(`I don't have a brief for "${who}".`);
		return;
	}
	await ctx.replyWithPhoto(new InputFile(composed.image, `${who}.png`), {
		caption: `${titleCase(who)}'s brief`
	});
}

/** Boot the bot if a token is present. Safe to call more than once. */
export async function bootBot(): Promise<void> {
	if (bot) return; // already running
	const token = env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		log(SCOPE, 'no TELEGRAM_BOT_TOKEN — bot disabled');
		return;
	}

	bot = new Bot(token);
	// Retry any outgoing API call Telegram rate-limits (429), honouring
	// retry_after. grammY's built-in retries only cover getMe/deleteWebhook —
	// our sendRichMessageDraft/sendRichMessage/reply calls need this.
	bot.api.config.use(autoRetry());

	// Whitelist gate. `/start` always passes (onboarding); whitelisted chats
	// pass; everyone else is dropped — with a chat-ID hint on a plain message so
	// a new family member can be added, and silently otherwise (e.g. callbacks).
	bot.use(async (ctx, next) => {
		if (ctx.message?.text?.startsWith('/start')) return next();
		if (isAllowed(ctx.chat?.id)) return next();
		log(SCOPE, `dropped update from un-whitelisted chat ${ctx.chat?.id}`);
		if (ctx.message) {
			await ctx.reply(
				`Not authorised yet. Your chat ID is ${ctx.chat?.id} — ask a parent to add it to the family list.`
			);
		}
		// no next() → drop
	});

	bot.command('start', async (ctx) => {
		const id = ctx.chat.id;
		await ctx.reply(
			isAllowed(id)
				? "Hey, I'm Chota. Ask me anything, or /print a brief."
				: `Hey, I'm Chota. You're not on the family list yet.\nYour chat ID is ${id} — add it to chota.config.ts > telegram.allowedChatIds.`
		);
	});

	// /print [who] — send a brief image. No/invalid arg → recipient buttons.
	bot.command('print', async (ctx) => {
		const arg = ctx.match.trim().toLowerCase();
		const recipients = printRecipients();
		if (arg && recipients.includes(arg)) {
			await sendBrief(ctx, arg);
			return;
		}
		const kb = new InlineKeyboard();
		for (const who of recipients) kb.text(titleCase(who), `print:${who}`);
		await ctx.reply('Whose brief?', { reply_markup: kb });
	});

	// Inline-keyboard taps from /print.
	bot.callbackQuery(/^print:(.+)$/, async (ctx) => {
		const who = ctx.match[1];
		await ctx.answerCallbackQuery();
		if (printRecipients().includes(who)) await sendBrief(ctx, who);
	});

	bot.on('message:text', async (ctx) => {
		const ev = event(SCOPE, 'message', { chat: ctx.chat.id });
		// The "typing…" status expires after 5s; the agent can take longer, so
		// renew it until the run finishes (the thinking-block draft takes over
		// once a tool fires or text streams).
		await ctx.replyWithChatAction('typing');
		const typing = setInterval(() => {
			ctx.replyWithChatAction('typing').catch(() => {});
		}, 4500);
		const run = (async () => {
			try {
				// Stream the reply as a Bot API 10.1 Rich Message — a <tg-thinking>
				// block while tools run, then the answer; plain-reply fallback.
				await runAgentStream({ prompt: ctx.message.text }, (result) =>
					streamRichReply(ctx, result)
				);
				ev.done();
			} catch (err) {
				logErr(SCOPE, 'agent failed', err);
				ev.fail(err);
				await ctx.reply("Sorry, I hit a snag and couldn't answer that one.");
			} finally {
				clearInterval(typing);
			}
		})();
		inFlight.add(run);
		try {
			await run;
		} finally {
			inFlight.delete(run);
		}
	});

	// grammY surfaces network / API errors here rather than throwing into the
	// polling loop — log them so a flaky run is visible, never fatal.
	bot.catch((err) => {
		const e = err.error;
		if (e instanceof GrammyError) logErr(SCOPE, 'telegram API error', e.description);
		else if (e instanceof HttpError) logErr(SCOPE, 'network error talking to telegram', e);
		else logErr(SCOPE, 'unexpected bot error', e);
	});

	// Fire-and-forget: bot.start() resolves only when polling stops, so we must
	// NOT await it here or init would hang. But we DO catch its rejection —
	// getMe/deleteWebhook run before the loop and a 401 (bad token) or 409
	// (another poller on this token) rejects here; without the catch that's a
	// silent unhandled rejection that can crash the process.
	const started = bot.start({
		drop_pending_updates: true, // don't answer messages queued while we were down
		onStart: async (info) => {
			log(SCOPE, `polling as @${info.username}`);
			await bot?.api
				.setMyCommands([
					{ command: 'start', description: 'Say hi / get your chat ID' },
					{ command: 'print', description: 'Print a brief (e.g. /print savi)' }
				])
				.catch((err) => logErr(SCOPE, 'setMyCommands failed', err));
		}
	});
	started.catch((err) => {
		logErr(SCOPE, 'bot.start() failed — polling not running', err);
		bot = undefined; // reset the singleton so a later bootBot() can retry
	});
}

/** Stop long polling — wired to SIGTERM/SIGINT alongside the job scheduler.
 *  `bot.stop()` aborts getUpdates but doesn't wait for in-flight middleware, so
 *  we drain any running handler (a streaming agent reply) before returning —
 *  this runs before `shutdownLogging()`, so a mid-flight reply finishes first. */
export async function stopBot(): Promise<void> {
	if (!bot) return;
	await bot.stop();
	await Promise.allSettled(inFlight);
	bot = undefined;
}
