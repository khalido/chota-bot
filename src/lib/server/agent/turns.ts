/**
 * What an agent run did, from the SDK's steps: the tool calls to keep, and the
 * numbers for its `chat_message` row and the `agent.run` event.
 */
import { changedSomething, reportedFailure, WRITE_DONE } from './errors';

/** A tool result larger than this is cut when stored, and marked `truncated`. */
const MAX_OUTPUT_CHARS = 200_000;

/** One tool call together with its result. */
export interface ToolPart {
	id: string;
	name: string;
	input: unknown;
	status: 'ok' | 'error';
	output: unknown;
	truncated?: true;
}

interface UsageLike {
	inputTokens?: number;
	outputTokens?: number;
	inputTokenDetails?: { cacheReadTokens?: number };
}

export interface StepLike {
	content: readonly unknown[];
	providerMetadata?: unknown;
	response?: { modelId?: string };
	usage?: UsageLike;
}

interface ContentPart {
	type?: string;
	toolCallId?: string;
	toolName?: string;
	input?: unknown;
	output?: unknown;
	error?: unknown;
}

function stored(output: unknown): Pick<ToolPart, 'output' | 'truncated'> {
	const text = typeof output === 'string' ? output : (JSON.stringify(output) ?? '');
	if (text.length <= MAX_OUTPUT_CHARS) return { output };
	return { output: text.slice(0, MAX_OUTPUT_CHARS), truncated: true };
}

/** Each tool call in a run, joined with its result or error. A call with no
 *  result yet (the run stopped first) is kept as an error, so it isn't lost. */
export function toolParts(steps: readonly StepLike[]): ToolPart[] {
	const parts = new Map<string, ToolPart>();
	for (const step of steps) {
		for (const raw of step.content) {
			const c = raw as ContentPart;
			if (!c.toolCallId) continue;
			if (c.type === 'tool-call') {
				parts.set(c.toolCallId, {
					id: c.toolCallId,
					name: c.toolName ?? 'unknown',
					input: c.input,
					status: 'error',
					output: null
				});
			}
			const part = parts.get(c.toolCallId);
			if (!part) continue;
			// A tool that returned `{ error }` failed, though nothing threw. Recorded
			// as ok, the next turn read "ticktick_add (ok)" for an add that never landed.
			if (c.type === 'tool-result')
				Object.assign(
					part,
					{ status: reportedFailure(c.output) ? 'error' : 'ok' },
					stored(c.output)
				);
			if (c.type === 'tool-error') Object.assign(part, stored(String(c.error)));
		}
	}
	return [...parts.values()];
}

/** The AI Gateway's dollar cost across steps; null when it didn't price the call. */
function gatewayCost(steps: readonly StepLike[]): number | null {
	let total = 0;
	let found = false;
	for (const s of steps) {
		const raw = (s.providerMetadata as { gateway?: { cost?: unknown } } | undefined)?.gateway?.cost;
		const n = typeof raw === 'string' ? Number(raw) : raw;
		if (typeof n === 'number' && Number.isFinite(n)) {
			total += n;
			found = true;
		}
	}
	return found ? total : null;
}

/** Adds up one number across steps; null if no step reported it. */
function sum(values: (number | undefined)[]): number | null {
	const known = values.filter((n) => n !== undefined);
	return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

/** The numbers for a run, from the steps it finished. A missing number stays
 *  null, never 0. */
export function turnStats(steps: readonly StepLike[]) {
	const last = steps.at(-1);
	const gateway = (
		last?.providerMetadata as { gateway?: { routing?: { finalProvider?: string } } } | undefined
	)?.gateway;
	return {
		model: last?.response?.modelId ?? null,
		provider: gateway?.routing?.finalProvider ?? null,
		steps: steps.length,
		tokensIn: sum(steps.map((s) => s.usage?.inputTokens)),
		tokensOut: sum(steps.map((s) => s.usage?.outputTokens)),
		cachedTokens: sum(steps.map((s) => s.usage?.inputTokenDetails?.cacheReadTokens)),
		costUsd: gatewayCost(steps)
	};
}

/** What the model sees for a run that wrote no text: without this, it can't tell
 *  a tool already acted, and may do it again when asked again. */
export function runNote(
	parts: readonly (Pick<ToolPart, 'name' | 'status'> & { input?: unknown; output?: unknown })[],
	error: string | null
) {
	const tools = parts.map((p) => `${p.name}${wrote(p)} (${outcome(p)})`).join(', ');
	return `[ran tools: ${tools}${error ? '; then the run failed' : ''}]`;
}

/** ok or failed; and for a write tool whose result shows nothing changed (an
 *  item already on the list, nothing ticked off, a question back), "no change".
 *  Judged from the output, so rows stored before failures were recorded as
 *  failed read right too. */
function outcome(p: { name: string; status: 'ok' | 'error'; output?: unknown }): string {
	if (p.status !== 'ok' || reportedFailure(p.output)) return 'failed';
	if (p.name in WRITE_DONE && p.output !== undefined && !changedSomething(p.name, p.output))
		return 'no change';
	return 'ok';
}

/** What a write tool was asked to do, so the model can see "milk" is already
 *  added and not add it again. Read tools get no detail. */
function wrote(p: { name: string; input?: unknown }): string {
	if (!(p.name in WRITE_DONE) || p.input === undefined || p.input === null) return '';
	const text = JSON.stringify(p.input) ?? '';
	return ` ${text.length > 120 ? `${text.slice(0, 120)}…` : text}`;
}
