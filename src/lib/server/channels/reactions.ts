/**
 * Emoji for "what the bot is doing", from yaad's tool reactions
 * (~/code/yaad/yaad/agent/hooks.py TOOL_EMOJIS). WhatsApp shows them as a
 * reaction on the person's message while the agent works — its stand-in for
 * Telegram's live thinking line. WhatsApp accepts any emoji; Telegram only
 * its default set, so a Telegram user would need yaad's _TG_REACTION_MAP.
 */
export const THINKING = '🤔';
export const FAILED = '💔';
const DEFAULT = '⚙️';

const TOOL_EMOJI: Record<string, string> = {
	weather: '🌤️',
	calendar: '📅',
	ticktick: '📋',
	ticktick_add: '✍️',
	ticktick_done: '✅',
	bus: '🚌',
	chores: '🧹',
	school_day: '🏫',
	school_dates: '🏫',
	title_info: '🎬',
	watch_ideas: '🍿',
	book: '📚',
	volleyball: '🏐',
	save: '💾',
	saved: '🗂️',
	web_search: '🔍',
	web_fetch: '🌐'
};

export const toolEmoji = (tool: string) => TOOL_EMOJI[tool] ?? DEFAULT;

/** Tools that change something — the only ones a quiet turn shows. */
export const WRITE_TOOLS = new Set(['ticktick_add', 'ticktick_done', 'save']);
