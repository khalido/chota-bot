/**
 * Telegram channel — grammY long polling, streamed Rich Message replies, and
 * the Telegram-only bits (/start, /print and its buttons). The conversation
 * itself (queue, history, agent) is the router's: `./index.ts`.
 *
 * Long polling (not webhooks): `bot.start()` runs an outbound `getUpdates`
 * loop inside this same Node process — NAT-friendly, no public URL, no second
 * service. See docs/telegram.md.
 *
 * Boot gate: starts whenever TELEGRAM_BOT_TOKEN is set. The hard rule is ONE
 * POLLER PER TOKEN — two processes calling getUpdates on the same token (your
 * Mac + the box) cause 409 conflicts. Locally use a throwaway dev token.
 *
 * Allowlist: only chats in `chota.config.ts > telegram.allowedChatIds` reach
 * the router, except `/start` (so anyone can fetch their chat ID to be
 * added). In groups, Telegram's privacy mode already limits the bot to
 * commands, @mentions and replies to it, so everything delivered counts as
 * addressed.
 */
import { Bot, InputFile, InlineKeyboard, GrammyError, HttpError, type Context } from 'grammy';
import { autoRetry } from '@grammyjs/auto-retry';
import { env } from '$env/dynamic/private';
import { getConfig } from '$lib/server/config';
import { composeImage } from '$lib/server/print/composers';
import { getRecipients, FAMILY_RECIPIENT } from '$lib/server/print/sections';
import { streamRichReply } from '$lib/server/telegram/stream';
import { log, logErr } from '$lib/server/log';
import { registerAlertChannel } from '$lib/server/alerts';
import type { Channel, Incoming, Outgoing } from './types';

const SCOPE = 'telegram';

const isAllowed = (chatId: number | undefined) =>
	chatId !== undefined && (getConfig().telegram?.allowedChatIds ?? []).includes(chatId);

/** `tg:-100123` → -100123 */
const chatIdOf = (threadId: string) => Number(threadId.slice('tg:'.length));

/** Title-case a recipient slug for display: `kid1` → `Kid1`, `family` → `Family`. */
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

/** The grammY context behind each Incoming, for replying in place. */
const contexts = new WeakMap<Incoming, Context>();

/** The Telegram channel, or null when no token is set (dev machines). */
export function telegramChannel(): Channel | null {
	const token = env.TELEGRAM_BOT_TOKEN;
	if (!token) {
		log(SCOPE, 'no TELEGRAM_BOT_TOKEN — Telegram disabled');
		return null;
	}
	const bot = new Bot(token);
	// Retry any outgoing call Telegram rate-limits (429), honouring retry_after.
	// grammY's built-in retries only cover getMe/deleteWebhook.
	bot.api.config.use(autoRetry());

	const send = async (threadId: string, out: Outgoing) => {
		const chatId = chatIdOf(threadId);
		if ('markdown' in out) {
			await bot.api
				.sendRichMessage(chatId, { markdown: out.markdown })
				.catch(() => bot.api.sendMessage(chatId, out.markdown));
		} else if ('image' in out) {
			await bot.api.sendPhoto(chatId, new InputFile(out.image), { caption: out.caption });
		} else {
			await bot.api.sendDocument(chatId, new InputFile(out.document, out.fileName));
		}
	};

	return {
		name: 'telegram',
		send,

		async start(onMessage) {
			// Alerts (failed jobs, printer problems) go to the notify chats.
			registerAlertChannel('telegram', async (text, { silent }) => {
				const ids = getConfig().telegram?.notifyChatIds ?? [];
				if (!ids.length) throw new Error('no telegram.notifyChatIds configured');
				// Each chat on its own; only all failing counts as unsent (a resend
				// would otherwise repeat it to the chats that got it).
				const results = await Promise.allSettled(
					ids.map((id) => bot.api.sendMessage(id, text, { disable_notification: silent }))
				);
				const failed = results.filter((r) => r.status === 'rejected');
				if (failed.length === ids.length) throw (failed[0] as PromiseRejectedResult).reason;
				if (failed.length) logErr(SCOPE, 'alert not delivered to every notify chat', failed[0]);
			});

			// Allowlist gate. `/start` always passes (onboarding); everyone else
			// not on the list is dropped, with a chat-ID hint on a plain message.
			bot.use(async (ctx, next) => {
				if (ctx.message?.text?.startsWith('/start')) return next();
				if (isAllowed(ctx.chat?.id)) return next();
				log(SCOPE, `dropped update from un-whitelisted chat ${ctx.chat?.id}`);
				if (ctx.message) {
					await ctx.reply(
						`Not authorised yet. Your chat ID is ${ctx.chat?.id} — ask a parent to add it to the family list.`
					);
				}
			});

			bot.command('start', async (ctx) => {
				const id = ctx.chat.id;
				// The user id goes on their family entry (`family[].telegram`).
				const you = ctx.from ? `\nYour Telegram user ID is ${ctx.from.id}.` : '';
				await ctx.reply(
					isAllowed(id)
						? `Hey, I'm Chota. Ask me anything, or /print a brief.${you}`
						: `Hey, I'm Chota. You're not on the family list yet.\nYour chat ID is ${id} — add it to chota.config.ts > telegram.allowedChatIds.${you}`
				);
			});

			// /print [who] — send a brief image. No/invalid arg → recipient buttons.
			bot.command('print', async (ctx) => {
				const arg = ctx.match.trim().toLowerCase();
				const recipients = printRecipients();
				if (arg && recipients.includes(arg)) return sendBrief(ctx, arg);
				const kb = new InlineKeyboard();
				for (const who of recipients) kb.text(titleCase(who), `print:${who}`);
				await ctx.reply('Whose brief?', { reply_markup: kb });
			});

			bot.callbackQuery(/^print:(.+)$/, async (ctx) => {
				const who = ctx.match[1];
				await ctx.answerCallbackQuery();
				if (printRecipients().includes(who)) await sendBrief(ctx, who);
			});

			bot.on('message:text', async (ctx) => {
				const m: Incoming = {
					threadId: `tg:${ctx.chat.id}`,
					channel: 'telegram',
					messageId: String(ctx.message.message_id),
					// The same family member as on WhatsApp, if their Telegram id is on file.
					person: ctx.from
						? ((getConfig().family ?? []).find((p) => p.telegram === ctx.from!.id) ?? null)
						: null,
					senderName: ctx.from?.first_name ?? 'Someone',
					text: ctx.message.text,
					isDM: ctx.chat.type === 'private',
					isMention: true, // privacy mode: groups only deliver what's addressed to us
					catchUp: false, // drop_pending_updates: nothing old arrives
					sentAt: new Date(ctx.message.date * 1000)
				};
				contexts.set(m, ctx);
				await onMessage(m);
			});

			// grammY surfaces network / API errors here rather than throwing into
			// the polling loop — log them so a flaky run is visible, never fatal.
			bot.catch((err) => {
				const e = err.error;
				if (e instanceof GrammyError) logErr(SCOPE, 'telegram API error', e.description);
				else if (e instanceof HttpError) logErr(SCOPE, 'network error talking to telegram', e);
				else logErr(SCOPE, 'unexpected bot error', e);
			});

			// Fire-and-forget: bot.start() resolves only when polling stops. Its
			// rejection (401 bad token, 409 another poller) is caught so it can't
			// crash the process.
			bot
				.start({
					drop_pending_updates: true, // don't answer messages queued while we were down
					// Only the update types we handle; getUpdates remembers this
					// server-side. Reactions-as-input would add 'message_reaction'.
					allowed_updates: ['message', 'callback_query'],
					onStart: async (info) => {
						log(SCOPE, `polling as @${info.username}`);
						await bot.api
							.setMyCommands([
								{ command: 'start', description: 'Say hi / get your chat ID' },
								// Example recipient comes from config — real names never live in code.
								{
									command: 'print',
									description: `Print a brief (e.g. /print ${getRecipients()[0] ?? 'family'})`
								}
							])
							.catch((err) => logErr(SCOPE, 'setMyCommands failed', err));
					}
				})
				.catch((err) => logErr(SCOPE, 'bot.start() failed — polling not running', err));
		},

		async stop() {
			await bot.stop();
		},

		async reply(m, result) {
			const ctx = contexts.get(m);
			if (!ctx) throw new Error('telegram reply without its context');
			// A Bot API 10.1 Rich Message: a <tg-thinking> block while tools run,
			// then the answer streaming in; plain-reply fallback.
			await streamRichReply(ctx, result);
		},

		typing(m) {
			// "typing…" expires after 5s; the agent can take longer, so renew it
			// until the run finishes (the thinking draft takes over once a tool
			// fires or text streams).
			const chatId = chatIdOf(m.threadId);
			const ping = () => bot.api.sendChatAction(chatId, 'typing').catch(() => {});
			ping();
			const timer = setInterval(ping, 4500);
			return () => clearInterval(timer);
		}
	};
}
