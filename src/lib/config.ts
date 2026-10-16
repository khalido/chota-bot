/**
 * Chota config types + the `defineChota` helper.
 *
 * The actual config lives at `chota.config.ts` at repo root (gitignored).
 * `chota.config.example.ts` shows the shape (committed). Loader is at
 * `src/lib/server/config.ts`.
 *
 * Why a TS file (not JSON): types + IDE autocomplete + comments + computed
 * values + matches the svelte/vite/tailwind/drizzle config convention.
 */

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export interface BusTrip {
	/** Human-readable label, e.g. "school". Used in the print receipt. */
	label: string;
	/** TfNSW stop ID (numeric string). */
	stop: string;
	/** Acceptable route numbers; the soonest match is shown. */
	routes: string[];
	/** Optional target time (HH:MM Sydney local). When set, today.ts shows
	 *  3 departures around this time (one before / closest / one after)
	 *  instead of "next 2 from now." */
	targetTime?: string;
}

export interface KidVolleyball {
	/** Team name as it appears on volleyballnsw.com.au fixture pages. Matched
	 *  as a case-insensitive substring — the site's spelling varies per page
	 *  ("SYDNEY ACERS VOLLEYBALL CLUB" on one, division-prefixed on another),
	 *  so configure the stable core of the name. */
	team: string;
	/** Division label shown on the print, e.g. "YSVL - Under 15 Boys". */
	division: string;
	/** The division draw/results URL, copy-pasted from the browser:
	 *  https://www.volleyballnsw.com.au/games/{competition}/{division} */
	draw: string;
}

export interface Kid {
	name: string;
	buses: BusTrip[];
	/** Weekend volleyball — fills the family sheet's VOLLEYBALL section with
	 *  this kid's next game + duty roster. Omit for kids who don't play. */
	volleyball?: KidVolleyball;
}

/** Map of chore key → kid name for one day. */
export type DayChores = Partial<Record<string, string>>;

export interface Chores {
	/** Chore key → human description. Used in print + dashboard render. */
	definitions: Record<string, string>;
	/** Day-of-week → { choreKey: kidName }. */
	rotation: Record<DayOfWeek, DayChores>;
}

export interface Activity {
	/** Substring matched against calendar event titles (case-insensitive). */
	name: string;
	gear: string[];
}

export interface FamilyMember {
	/** Display name shown on chips + in print. Acts as the canonical id. */
	name: string;
	/** All names this person goes by in calendar event titles. Include the
	 *  canonical name. Whole-word, case-insensitive match. */
	aliases: string[];
	/** Whether this person gets an auto-printed weekday brief (the 06:45
	 *  `morning-print` job). Defaults to true. Set false to keep someone as a
	 *  valid on-demand / `/print/<who>` recipient (and calendar-tag target)
	 *  without a daily sheet — e.g. parents who don't want a morning printout. */
	autoPrint?: boolean;
	/** WhatsApp number, E.164 ("+614…"). Having one puts this person on the
	 *  WhatsApp allowlist — the bot answers only family members with a number,
	 *  in a DM or a group. Config only, never the repo. */
	whatsapp?: string;
	/** Email — for their own calendar later, and who they are when they sign
	 *  in. Config only, never the repo. */
	email?: string;
}

export interface WeatherThresholds {
	coldC: number;
	hotC: number;
	windyKmh: number;
	uvHigh: number;
	rainPctSoon: number;
	/** Window in minutes for "rain soon" headline. Within this, surface the alert. */
	rainSoonMins: number;
}

export interface ChotaConfig {
	/** Google-account emails allowed into /admin and the gated APIs (the agent
	 *  chat endpoint, admin log tail, sentral cache, …). Anyone else — signed
	 *  in or not — is turned away by the hooks.server.ts guard. Empty/omitted
	 *  means NOBODY gets in (fail closed); preflight warns at boot. */
	adminEmails?: string[];
	kids: Kid[];
	/** Everyone whose name might appear in calendar events. Used to tag
	 *  events with people chips on the dashboard + print. */
	family?: FamilyMember[];
	chores?: Chores;
	/** Family location for weather + sunrise/sunset.
	 *  weather: optional thresholds for the headline rules engine.
	 *  Sydney defaults are used when omitted. */
	home?: {
		suburb?: string;
		lat?: number;
		lon?: number;
		weather?: Partial<WeatherThresholds>;
		/** Local beach for the lifeguard surf report (Randwick City Council
		 *  feed). `name` must match a beach title in the feed —
		 *  "Maroubra", "Clovelly". Omit to disable the beach line. Currently
		 *  Randwick-council beaches only (that's the one feed we parse). */
		beach?: { name: string };
	};
	/** School region + NSW division. `division` picks which School Development
	 *  Days apply — `'E'` (Eastern: Sydney, coast, Hunter, Illawarra) or `'W'`
	 *  (Western). Defaults to `'E'` when omitted. */
	school?: { region?: string; division?: 'E' | 'W' };
	/** Family Google Calendar (read-only, later). */
	calendar?: { id?: string };
	/** TickTick MCP integration. Maps stable internal names (used in code +
	 *  agent prompts) to actual TickTick list names. Only listed lists are
	 *  visible to the bot; everything else stays private.
	 *
	 *  The internal name is what the rest of the codebase uses
	 *  (`getList('shopping')`); the external name is the exact list name in
	 *  TickTick. Rename in TickTick → change one config string. Lookup is
	 *  case-insensitive on the external name. */
	ticktick?: {
		lists?: Record<string, string>;
	};
	/** Print-output options (what the briefs include). */
	print?: {
		/** Print the bootprint picture alongside the DID YOU KNOW fact.
		 *  Off by default — kept as a toggle so the image can be enabled
		 *  later without re-plumbing the fetch. */
		factImage?: boolean;
	};
	/** Thermal printer USB IDs + paper geometry. Vary per unit — confirm
	 *  yours with `node scripts/printer-test.mjs visible`. */
	printer?: {
		/** USB vendor ID. Many MUNBYNs use STMicro's generic 0x0483. */
		vendorId: number;
		/** USB product ID. Confirmed for the kit-on-hand: 0x5743. */
		productId: number;
	};
	/** Activity → packing-list mapping for the after-school gear tool (later). */
	activities?: Activity[];
	/** Chat channels (`$lib/server/channels`). `default` carries messages the
	 *  bot starts itself — alerts, later nudges; `fallback` is tried when the
	 *  default fails (its connection is down). */
	channels?: {
		/** Default 'telegram'. */
		default?: 'telegram' | 'whatsapp';
		fallback?: 'telegram' | 'whatsapp';
	};
	/** Alerts (`$lib/server/alerts.ts`): problems the bot tells someone about —
	 *  a failed job, the printer out of paper. */
	alerts?: {
		/** Override `channels.default` for alerts. Telegram sends to
		 *  `telegram.notifyChatIds`. */
		channel?: 'telegram' | 'whatsapp';
		/** Sydney "HH:MM" span when alerts arrive without a sound, e.g.
		 *  { from: '21:00', to: '06:30' } — ending before the 06:45 print, so a
		 *  failed brief buzzes. Omit to always notify. */
		quietHours?: { from: string; to: string };
	};
	/** WhatsApp (docs/whatsapp.md). Who may talk to it comes from
	 *  `family[].whatsapp`. */
	whatsapp?: {
		/** The bot's own number, E.164 — WhatsApp Business on its own SIM. */
		botNumber?: string;
	};
	/** Telegram bot wiring. Token + username live in `.env` (the token's a
	 *  secret); chat IDs live here because they're per-family and typed. */
	telegram?: {
		/** Chat IDs that receive proactive pushes from the bot — alerts
		 *  (failed jobs, printer problems), later the daily summary. Usually a
		 *  parent or two. */
		notifyChatIds?: number[];
		/** Chat IDs allowed to interact with the bot (Phase 3 inbound). Anyone
		 *  not on this list is silently dropped at the middleware layer. */
		allowedChatIds?: number[];
	};
}

/**
 * Identity function with type inference. Same trick as `defineConfig` in
 * vite. Wrapping the literal in `defineChota({...})` gives full
 * type-checking + autocomplete on the config in chota.config.ts.
 */
export function defineChota<T extends ChotaConfig>(config: T): T {
	return config;
}
