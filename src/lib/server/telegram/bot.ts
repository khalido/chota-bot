/**
 * Telegram bot — the basic text→agent path (Phase 3 skeleton).
 *
 * Long polling (not webhooks): `bot.start()` runs an outbound `getUpdates`
 * loop inside this same Node process — NAT-friendly, no public URL, no second
 * service. See docs/telegram.md for the full design (voice, streaming via
 * Rich Messages, Mini Apps — all still ahead).
 *
 * Boot gate: we start whenever TELEGRAM_BOT_TOKEN is set. The hard rule is
 * ONE POLLER PER TOKEN — two processes calling getUpdates on the same token
 * (your Mac + the box) cause 409 conflicts and eaten messages. So locally use
 * a throwaway dev token from @BotFather; the box's .env carries the real one.
 *
 * Whitelist: only chat IDs in chota.config.ts > telegram.allowedChatIds reach
 * the agent. Anyone else gets a polite "not authorised" with their chat ID so
 * onboarding is self-serve (press Start → copy the ID → add to config). We do
 * NOT use LLM moderation for inbound — the whitelist is the gate.
 */
import { Bot, GrammyError, HttpError } from 'grammy';
import { env } from '$env/dynamic/private';
import { getConfig } from '$lib/server/config';
import { runAgentStream } from '$lib/server/agent';
import { streamRichReply } from './stream';
import { event, log, logErr } from '$lib/server/log';

const SCOPE = 'telegram';

/** Module-level singleton so HMR / double init never starts two pollers. */
let bot: Bot | undefined;

function isAllowed(chatId: number): boolean {
	const allowed = getConfig().telegram?.allowedChatIds ?? [];
	return allowed.includes(chatId);
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

	// `/start` always answers (even un-whitelisted) so people can onboard:
	// it hands back the chat ID to drop into chota.config.ts.
	bot.command('start', async (ctx) => {
		const id = ctx.chat.id;
		const ok = isAllowed(id);
		await ctx.reply(
			ok
				? "Hey, I'm Chota. Ask me anything."
				: `Hey, I'm Chota. You're not on the family list yet.\nYour chat ID is ${id} — add it to chota.config.ts > telegram.allowedChatIds.`
		);
	});

	bot.on('message:text', async (ctx) => {
		const id = ctx.chat.id;
		if (!isAllowed(id)) {
			log(SCOPE, `dropped message from un-whitelisted chat ${id}`);
			await ctx.reply(
				`Not authorised yet. Your chat ID is ${id} — ask a parent to add it to the family list.`
			);
			return;
		}

		const ev = event(SCOPE, 'message', { chat: id });
		try {
			await ctx.replyWithChatAction('typing');
			// Stream the reply as a Bot API 10.1 Rich Message (live draft →
			// persisted final), falling back to a plain reply if unsupported.
			await runAgentStream({ prompt: ctx.message.text }, (ts) => streamRichReply(ctx, ts));
			ev.done();
		} catch (err) {
			logErr(SCOPE, 'agent failed', err);
			ev.fail(err);
			await ctx.reply("Sorry, I hit a snag and couldn't answer that one.");
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
	// NOT await it here or init would hang. onStart logs once polling is live.
	void bot.start({
		onStart: (info) => log(SCOPE, `polling as @${info.username}`)
	});
}

/** Stop long polling — wired to SIGTERM/SIGINT alongside the job scheduler. */
export async function stopBot(): Promise<void> {
	if (!bot) return;
	await bot.stop();
	bot = undefined;
}
