// The protocol, v1: what a sender may send and what the receiver answers. One source for the receiver's checks, the
// types, and the docs (landing page, llms.txt).
import { z } from 'zod';

export const NAMESPACE = 'urn:x-cast:dev.khalido.cast';
export const VERSION = 1;

/** Every limit the receiver enforces. A message over one is refused with an `error`, never trimmed. */
export const LIMITS = {
	/** Largest message a sender should send, envelope included (Cast's own cap is 64 KiB). */
	partBytes: 60_000,
	/** Most parts in one payload. */
	parts: 64,
	/** Largest joined payload, in bytes of JSON. */
	payloadBytes: 2_000_000,
	/** Half-received payloads held at once, across all senders. */
	pending: 8,
	/** A half-received payload is dropped this long after its first part. */
	partialMs: 30_000,
	screens: 20,
	blocksPerScreen: 24,
	itemsPerBlock: 50,
	/** HTML plus CSS of one HTML screen, in characters. */
	htmlChars: 400_000,
	/** Longest string anywhere else (a title, an item, a text block). */
	textChars: 20_000
} as const;

const text = (max: number = LIMITS.textChars) => z.string().max(max);
const items = <T extends z.ZodType>(item: T) => z.array(item).max(LIMITS.itemsPerBlock);
/** An IANA zone the TV's Intl knows; an unknown one is refused rather than swapped for the TV's own. */
const timezone = z
	.string()
	.max(64)
	.refine(
		(tz) => {
			try {
				new Intl.DateTimeFormat(undefined, { timeZone: tz });
				return true;
			} catch {
				return false;
			}
		},
		{ message: 'unknown time zone' }
	);
/** An instant, ISO 8601 with an offset or Z ("2026-11-15T07:40:00+11:00"). */
const instant = z.iso.datetime({ offset: true });
/** The one rule for every image URL (blocks, cards, HTML screens): https:, or a base64 data:image. */
export const isImageUrl = (s: string) =>
	/^https:\/\//i.test(s) || /^data:image\/(png|jpeg|gif|webp|svg\+xml|avif);base64,/i.test(s);
const imageUrl = z
	.string()
	.max(LIMITS.payloadBytes)
	.refine(isImageUrl, { message: 'images must be https: or data:image/…;base64' });

/** How many grid columns a block takes on a screen; the screen sets the column count. */
const span = z.number().int().min(1).max(4).optional();

export const ClockBlock = z.object({
	type: z.literal('clock'),
	span,
	/** Show the date under the time. Default true. */
	date: z.boolean().optional(),
	/** IANA zone; default the theme's, else the TV's. */
	timezone: timezone.optional()
});

export const StatBlock = z.object({
	type: z.literal('stat'),
	span,
	label: text(200),
	value: z.union([z.string().max(40), z.number()]),
	unit: text(20).optional(),
	/** "+3%", "−2 °C", "12 fewer than yesterday". */
	delta: text(80).optional(),
	/** Colours the delta. Default neutral. */
	tone: z.enum(['good', 'bad', 'neutral']).optional(),
	note: text(200).optional()
});

export const ListBlock = z.object({
	type: z.literal('list'),
	span,
	title: text(200).optional(),
	items: items(
		z.object({
			id: z.string().max(100).optional(),
			text: text(500),
			/** Right-aligned: a time, an amount, a count. */
			meta: text(80).optional(),
			detail: text(500).optional(),
			done: z.boolean().optional()
		})
	)
});

export const CardsBlock = z.object({
	type: z.literal('cards'),
	span,
	title: text(200).optional(),
	items: items(
		z.object({
			id: z.string().max(100).optional(),
			title: text(200),
			body: text(1000).optional(),
			meta: text(80).optional(),
			image: imageUrl.optional()
		})
	)
});

export const TextBlock = z.object({
	type: z.literal('text'),
	span,
	title: text(200).optional(),
	/** Markdown-ish: "# heading", "- bullet", blank-line paragraphs, **bold**, *italic*, `code`. No HTML. */
	text: text()
});

export const ImageBlock = z.object({
	type: z.literal('image'),
	span,
	src: imageUrl,
	alt: text(300).optional(),
	caption: text(300).optional(),
	/** Default "contain". */
	fit: z.enum(['contain', 'cover']).optional()
});

export const WeatherBlock = z.object({
	type: z.literal('weather'),
	span,
	place: text(100).optional(),
	now: z.object({
		tempC: z.number(),
		condition: text(80),
		feelsLikeC: z.number().optional(),
		/** e.g. "High 24° · Low 15°" or "Rain from 3pm". */
		note: text(200).optional()
	}),
	/** Hours already past are hidden as the clock moves on. */
	hours: items(
		z.object({
			at: instant,
			tempC: z.number(),
			/** Chance of rain, 0–100. */
			rainPct: z.number().min(0).max(100).optional()
		})
	).optional()
});

export const CalendarDayBlock = z.object({
	type: z.literal('calendar-day'),
	span,
	title: text(200).optional(),
	events: items(
		z.object({
			id: z.string().max(100).optional(),
			title: text(300),
			/** Omit for an all-day event. */
			start: instant.optional(),
			end: instant.optional(),
			where: text(200).optional(),
			who: text(200).optional()
		})
	)
});

export const BusBlock = z.object({
	type: z.literal('bus'),
	span,
	title: text(200).optional(),
	/** One row per route and direction; minutes count down on the receiver, departures gone are hidden. */
	routes: items(
		z.object({
			route: text(20),
			/** Where it goes, or who takes it. */
			to: text(200).optional(),
			departures: z
				.array(
					z.object({
						at: instant,
						/** False: timetabled, not tracked live. */
						realtime: z.boolean().optional(),
						cancelled: z.boolean().optional()
					})
				)
				.max(10)
		})
	)
});

export const Block = z.discriminatedUnion('type', [
	ClockBlock,
	StatBlock,
	ListBlock,
	CardsBlock,
	TextBlock,
	ImageBlock,
	WeatherBlock,
	CalendarDayBlock,
	BusBlock
]);
export type Block = z.infer<typeof Block>;
export type BlockType = Block['type'];

export const Screen = z
	.object({
		id: z.string().min(1).max(100),
		/** Shown as the screen's tab label. */
		title: text(60),
		/** Grid columns for the blocks, 1–4. Default 2. */
		columns: z.number().int().min(1).max(4).optional(),
		blocks: z.array(Block).max(LIMITS.blocksPerScreen).optional(),
		/** Your own HTML and CSS, sanitised (no scripts, handlers or frames) and shown in a Shadow DOM. */
		html: z
			.object({ html: z.string(), css: z.string().optional() })
			.refine((h) => h.html.length + (h.css?.length ?? 0) <= LIMITS.htmlChars, {
				message: `html plus css over ${LIMITS.htmlChars} characters`
			})
			.optional()
	})
	.refine((s) => (s.blocks ? 1 : 0) + (s.html ? 1 : 0) === 1, {
		message: 'a screen has blocks or html, not both or neither'
	});
export type Screen = z.infer<typeof Screen>;

export const Theme = z.object({
	/** A hex colour for the active tab and highlights. Keep it muted: it stays on screen for hours. */
	accent: z
		.string()
		.regex(/^#[0-9a-f]{6}$/i, 'accent is a hex colour like #e0a458')
		.optional(),
	/** "comfortable" (default) or "compact": smaller type, more on screen. */
	density: z.enum(['comfortable', 'compact']).optional(),
	/** IANA zone for every time shown; default the TV's. */
	timezone: timezone.optional(),
	/** 12-hour clock ("7:40 pm"). Default false (24-hour). */
	hour12: z.boolean().optional()
});
export type Theme = z.infer<typeof Theme>;

/** The payload of each message type, in `data`. */
export const Payloads = {
	/** Replace the list of screens. `show` picks the one on screen; else the current one stays if still there. */
	screens: z.object({
		screens: z.array(Screen).min(1).max(LIMITS.screens),
		show: z.string().optional()
	}),
	/** Update one screen in place by id, or add it at the end. */
	screen: z.object({ screen: Screen }),
	/** Switch to a screen. */
	show: z.object({ screen: z.string() }),
	/** Set the theme (replaces the whole theme). */
	theme: Theme,
	/** Back to the waiting clock. */
	clear: z.object({}).optional()
} as const;
export type MessageType = keyof typeof Payloads;

/** What arrives on the namespace. A payload too big for one message is split: see `split()`. */
export const Envelope = z.object({
	v: z.number(),
	/** The sender's id for this payload: replies name it, parts of one payload share it. */
	id: z.string().min(1).max(100),
	type: z.string(),
	/** The sender's revision; the receiver refuses one older than the newest it applied. Date.now() works. */
	revision: z.number().int().nonnegative(),
	/** Part number, from 0. Default 0. */
	seq: z.number().int().nonnegative().optional(),
	/** Parts in the payload. Default 1. */
	total: z.number().int().positive().optional(),
	/** The payload, when it fits in one message. */
	data: z.unknown().optional(),
	/** A slice of JSON.stringify(data), when split; the slices joined in seq order parse to the payload. */
	chunk: z.string().optional()
});
export type Envelope = z.infer<typeof Envelope>;

export const ERROR_CODES = [
	'version', // v isn't 1
	'bad-message', // not an envelope, an unknown type, a payload that doesn't match its type, parts that disagree
	'too-big', // over a limit in LIMITS
	'busy', // too many half-received payloads
	'stale', // revision older than the receiver's
	'timeout', // parts stopped arriving
	'unknown-screen' // show named a screen that isn't there
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** Receiver → sender. `revision` is always the receiver's current one, so a sender refused as stale can catch up. */
export type Reply =
	| { v: 1; type: 'ack'; id: string; revision: number }
	| { v: 1; type: 'error'; id?: string; code: ErrorCode; message: string; revision: number };
