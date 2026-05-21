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

export interface Kid {
	name: string;
	buses: BusTrip[];
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
}

/**
 * Identity function with type inference. Same trick as `defineConfig` in
 * vite. Wrapping the literal in `defineChota({...})` gives full
 * type-checking + autocomplete on the config in chota.config.ts.
 */
export function defineChota<T extends ChotaConfig>(config: T): T {
	return config;
}
