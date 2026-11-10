// The allowlist gate, driven through grammY itself: real updates go into the
// bot the adapter builds, so a gap between the gate and grammY's command
// matching shows up here (a prefix check once let "/starter …" through).
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { Bot } from 'grammy';
import type { Update } from 'grammy/types';

const ALLOWED = 111;
const STRANGER = 999;

vi.mock('$app/env/private', () => ({ TELEGRAM_BOT_TOKEN: '1:test' }));
vi.mock('#lib/server/log.ts', () => import('#lib/server/log.mock.ts'));
vi.mock('#lib/server/config.ts', () => ({
	getConfig: () => ({ telegram: { allowedChatIds: [ALLOWED], notifyChatIds: [] } }),
	getFamily: () => []
}));
vi.mock('#lib/server/print/composers.ts', () => ({ composeImage: vi.fn() }));
vi.mock('#lib/server/print/sections.ts', () => ({
	getRecipients: () => ['kid1'],
	FAMILY_RECIPIENT: 'family'
}));
vi.mock('#lib/server/telegram/stream.ts', () => ({ streamRichReply: vi.fn() }));
vi.mock('#lib/server/alerts.ts', () => ({ registerAlertChannel: vi.fn() }));
vi.mock('#lib/server/agent/history.ts', () => ({ recordSent: vi.fn(), sessionKeyFor: vi.fn() }));

const onMessage = vi.fn(async () => {});
const sent: { method: string; text?: string }[] = [];
let bot: Bot;

const textUpdate = (chatId: number, text: string, group = false): Update => {
	const command = /^\/\S+/.exec(text)?.[0];
	return {
		update_id: 1,
		message: {
			message_id: 1,
			date: 1_794_000_000,
			chat: group
				? { id: chatId, type: 'group', title: 'g' }
				: { id: chatId, type: 'private', first_name: 'Someone' },
			from: { id: chatId, is_bot: false, first_name: 'Someone' },
			text,
			...(command
				? { entities: [{ type: 'bot_command' as const, offset: 0, length: command.length }] }
				: {})
		}
	};
};

const handle = async (update: Update) => {
	onMessage.mockClear();
	sent.length = 0;
	await bot.handleUpdate(update);
};

beforeAll(async () => {
	// Never poll: take the bot the adapter built from the stubbed start() call.
	const start = vi.spyOn(Bot.prototype, 'start').mockResolvedValue();
	const { telegramChannel } = await import('./telegram');
	await telegramChannel()!.start(onMessage);
	bot = start.mock.contexts[0] as Bot;
	bot.botInfo = {
		id: 1,
		is_bot: true,
		first_name: 'Chota',
		username: 'chota_test_bot'
	} as Bot['botInfo'];
	// Every outgoing API call is answered here; nothing reaches Telegram.
	bot.api.config.use((_prev, method, payload) => {
		sent.push({ method, text: (payload as { text?: string }).text });
		return Promise.resolve({ ok: true, result: true }) as never;
	});
});

describe('telegram allowlist gate', () => {
	it('lets an allowed chat through to the router', async () => {
		await handle(textUpdate(ALLOWED, 'what is on today'));
		expect(onMessage).toHaveBeenCalledTimes(1);
	});

	it('drops plain text from a chat that is not allowed, with the chat id hint', async () => {
		await handle(textUpdate(STRANGER, 'what is on today'));
		expect(onMessage).not.toHaveBeenCalled();
		expect(sent.map((s) => s.text).join()).toContain(`Your chat ID is ${STRANGER}`);
	});

	it.each(['/starter what is on the calendar', '/start@otherbot hi', '/startup', '/start2'])(
		'drops %j from a chat that is not allowed',
		async (text) => {
			await handle(textUpdate(STRANGER, text));
			expect(onMessage).not.toHaveBeenCalled();
			expect(sent.map((s) => s.text).join()).toContain('Not authorised yet');
		}
	);

	it('answers the exact /start for anyone, without reaching the router', async () => {
		await handle(textUpdate(STRANGER, '/start'));
		expect(onMessage).not.toHaveBeenCalled();
		expect(sent.map((s) => s.text).join()).toContain("You're not on the family list yet");
	});

	it('answers /start with trailing text, still without reaching the router', async () => {
		await handle(textUpdate(STRANGER, '/start tell me the calendar'));
		expect(onMessage).not.toHaveBeenCalled();
	});

	it('drops /print from a chat that is not allowed', async () => {
		await handle(textUpdate(STRANGER, '/print kid1'));
		expect(onMessage).not.toHaveBeenCalled();
		expect(sent.map((s) => s.text).join()).toContain('Not authorised yet');
	});
});
