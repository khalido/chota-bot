/**
 * What to say when a chat turn dies, and what to log.
 *
 * One "Sorry, I hit a snag" for every failure told the family nothing: is it
 * worth asking again, or is something broken on our side? On 28 Oct 2026 a
 * dead gateway key would have said "snag" to every message. The split that
 * matters to a person: try again, or tell a parent. `kind` + `detail` go to
 * the log. Ported from everx `chat/errors.ts`.
 */
import { InvalidToolInputError, NoOutputGeneratedError, NoSuchToolError, RetryError } from 'ai';

export interface ChatFailure {
	/** Short slug for the log: `provider-503`, `tool-input`. */
	kind: string;
	/** The full error text — log only, never shown. */
	detail: string;
	/** One sentence for the family. Says whether asking again is worth it. */
	message: string;
}

function textOf(error: unknown): string {
	if (error instanceof Error) return `${error.name}: ${error.message}`;
	return String(error);
}

/** The error underneath: retries keep their last failure, and a stream that
 *  produced nothing may carry the provider's error as its cause. */
function rootOf(error: unknown): unknown {
	let e = error;
	for (let i = 0; i < 5; i++) {
		if (RetryError.isInstance(e)) e = e.lastError;
		else if (NoOutputGeneratedError.isInstance(e) && e.cause !== undefined) e = e.cause;
		else break;
	}
	return e;
}

/** An HTTP status, from the SDK's APICallError or the gateway's own errors
 *  (GatewayAuthenticationError etc. are not APICallErrors but carry one). */
function statusOf(e: unknown): number | undefined {
	const s = (e as { statusCode?: unknown } | null)?.statusCode;
	return typeof s === 'number' ? s : undefined;
}

/**
 * The tools that change something, with what each did in the family's words.
 * The one list of "write tools": the quiet-turn reactions use its keys.
 */
export const WRITE_DONE: Record<string, string> = {
	ticktick_add: 'added to a list',
	ticktick_done: 'ticked something off a list',
	music_play: 'started music',
	music_control: 'changed the music',
	announce: 'made an announcement',
	save: 'saved something'
};

/**
 * Did the tool say it failed? Chota's tools report a failure as a result, not a
 * throw: `{ error }`, or `{ said: false }` from `announce`.
 */
export function reportedFailure(output: unknown): boolean {
	if (typeof output !== 'object' || output === null) return false;
	const o = output as Record<string, unknown>;
	return 'error' in o || o.said === false;
}

/**
 * Did this tool call change something? The write tools report a failure as a
 * result, not a throw (`{ error }`, `{ said: false }`), and some results are a
 * question back (`music_play` listing episodes to choose from), so the name
 * alone isn't enough.
 */
export function changedSomething(tool: string, output: unknown): boolean {
	if (!(tool in WRITE_DONE) || typeof output !== 'object' || output === null) return false;
	const o = output as Record<string, unknown>;
	if (reportedFailure(output)) return false;
	if (tool === 'music_play' || tool === 'music_control') return o.ok === true;
	if (tool === 'ticktick_done') return Array.isArray(o.done) && o.done.length > 0;
	if (tool === 'ticktick_add') return typeof o.added === 'string';
	if (tool === 'announce') return o.said === true;
	if (tool === 'save') return o.saved !== undefined;
	return false;
}

/**
 * What to tell the person when a turn failed after some of it had worked.
 * "Ask again" is wrong then: asking again adds the milk twice. `done` is the
 * names of the write tools that changed something before the failure
 * (`changedSomething`), gathered as each tool finishes: a step cut off by the
 * time limit never reaches the stored steps.
 */
export function failureMessage(failure: ChatFailure, done: readonly string[]): string {
	const did = [...new Set(done.map((name) => WRITE_DONE[name]).filter(Boolean))];
	if (did.length === 0) return failure.message;
	const first = failure.message.replace(
		/\s*(Ask again[^.]*|Try asking it a different way)\.\s*$/,
		''
	);
	return `${first} Before that I had already ${did.join(' and ')}, so check before asking again.`;
}

export function describeChatError(outer: unknown): ChatFailure {
	const error = rootOf(outer);
	const detail = error === outer ? textOf(outer) : `${textOf(outer)} <- ${textOf(error)}`;

	// The turn's own time limit (TURN_TIMEOUT), or a tool's.
	if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
		return {
			kind: 'timeout',
			detail,
			message: 'That took too long, so I stopped. Ask again, maybe for less at once.'
		};
	}

	// The provider or the gateway.
	const status = statusOf(error);
	if (status !== undefined) {
		const retryable = (error as { isRetryable?: unknown }).isRetryable === true;
		if (retryable || status === 429 || status >= 500) {
			return {
				kind: `provider-${status}`,
				detail,
				message: `The AI service is busy or down (${status}). Ask again in a minute.`
			};
		}
		// A bad AI_GATEWAY_API_KEY or an empty budget: ours to fix, not theirs.
		if (status === 401 || status === 402 || status === 403) {
			return {
				kind: `provider-${status}`,
				detail,
				message: `The AI service turned down chota's account (${status}): a key or budget problem, not your message. Tell a parent.`
			};
		}
		return {
			kind: `provider-${status}`,
			detail,
			message: `The AI service rejected that (${status}). Try asking it a different way.`
		};
	}

	// The model's mistake, not a broken tool: asking again usually works.
	if (NoSuchToolError.isInstance(error) || InvalidToolInputError.isInstance(error)) {
		return {
			kind: NoSuchToolError.isInstance(error) ? 'no-such-tool' : 'tool-input',
			detail,
			message: 'I tripped over my own lookup. Ask again.'
		};
	}

	// Anything named like a tool problem — the SDK adds error classes between versions.
	if (error instanceof Error && /tool/i.test(error.name)) {
		return { kind: 'tool', detail, message: 'One of my lookups failed. Ask again.' };
	}

	return { kind: 'unknown', detail, message: 'Something went wrong answering that. Ask again.' };
}

/** When a turn finishes with no text at all. */
export const EMPTY_REPLY = "I looked but couldn't put an answer together. Try asking another way.";
