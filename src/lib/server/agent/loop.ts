/**
 * A turn's limits (steps, time, money), and the last step that has to answer.
 *
 * A model still calling tools when the step cap hits ends with an empty reply,
 * so the cap is pinned here with the last-step rule beside it: on the final
 * step, or once the turn has spent its soft limit, the tools are taken away and
 * the model is told to answer from what it found.
 *
 * Ported from syntechfibres `agent/loop-guard.ts` (answerWhenDone,
 * lookupsAsText). There, GLM still wrote one more tool call out as text when
 * its history held tool calls, so the final step sees every lookup rewritten
 * as plain text.
 */
import { isStepCount, type Instructions, type ModelMessage } from 'ai';
import { turnStats, type StepLike } from './turns';

/** Steps per turn. Real turns take one or two (the Pi's runs, Nov 2026); 12
 *  leaves room for a long lookup and stops a loop early. */
export const MAX_STEPS = 12;

/**
 * Money per turn, from AI Gateway's own price for each step. Real turns cost
 * about half a cent. Past `softUsd` the next step answers without tools; past
 * `hardUsd` the turn ends (a guard in case one step alone is dear).
 */
export const TURN_COST = { softUsd: 0.1, hardUsd: 0.2 };

/** Money for the chat agent's turns in a Sydney day, across every chat. Past it,
 *  chota says it's done for the day and raises an alert (channels/index.ts).
 *  Only turns count: triage, saving links, transcription and book lookups
 *  aren't recorded per call, and are a small share. */
export const DAILY_COST_USD = 2;

/** What the turn has cost so far; 0 while the gateway hasn't priced it. */
export const spentUsd = (steps: readonly StepLike[]): number => turnStats(steps).costUsd ?? 0;

/** Ends the turn once it has spent `TURN_COST.hardUsd`. */
export const pastHardCost = ({ steps }: { steps: readonly StepLike[] }): boolean =>
	spentUsd(steps) >= TURN_COST.hardUsd;

export const STOP_WHEN = [isStepCount(MAX_STEPS), pastHardCost];

/**
 * The tools of a quiet turn: an untagged group message (or photo) the triage
 * passed on, which nobody asked chota about. It may read the lists, the
 * calendar and the school dates, and add to or tick off a list. Nothing else:
 * no web, no saving, no music, no speaking. Set per call in `prepareCall`, so a
 * new tool is off for quiet turns unless it is added here. The write tools
 * also still refuse a quiet asker themselves, as a second guard.
 */
export const QUIET_TOOLS = [
	'ticktick',
	'ticktick_add',
	'ticktick_done',
	'calendar',
	'school_dates'
] as const;

/**
 * How long a turn may take: two minutes in all, 45 s for the model to start or
 * to go quiet. Real turns take seconds. Without a limit one hung model stream or tool
 * blocked that chat's queue for good, and made a deploy's shutdown wait.
 * `firstChunkMs` is how long the model may take to start answering, `chunkMs`
 * the longest silence once it has. No per-tool limit: the SDK enforces one only
 * through the abort signal it hands a tool, and chota's tools don't read it, so
 * a hung tool is ended by `totalMs` (and keeps running in the background).
 */
export const TURN_TIMEOUT = { totalMs: 2 * 60_000, firstChunkMs: 45_000, chunkMs: 45_000 };

/** Said to the model on the step where its tools are taken away. */
export const ANSWER_NOW =
	'NO MORE TOOLS: the lookups for this question are over. Write the answer now from the tool ' +
	'results above, in plain text. Say plainly what you could not find. Never write a tool call.';

/** `prepareStep`: on the last step (stepNumber counts from 0), or once the turn
 *  has spent `TURN_COST.softUsd`, answer without tools. */
export function answerWhenDone({
	stepNumber,
	steps = [],
	messages,
	instructions
}: {
	stepNumber: number;
	steps?: readonly StepLike[];
	messages: ModelMessage[];
	instructions: Instructions | undefined;
}) {
	if (stepNumber < MAX_STEPS - 1 && spentUsd(steps) < TURN_COST.softUsd) return {};
	// prepareCall always sets the instructions as one string (buildSystemPrompt).
	return {
		toolChoice: 'none' as const,
		activeTools: [],
		messages: lookupsAsText(messages),
		instructions: `${instructions ?? ''}\n\n${ANSWER_NOW}`.trim()
	};
}

/**
 * The history with no tool calls in it: an assistant message keeps its text,
 * and each tool result becomes a user message naming the lookup and what came
 * back. Reasoning goes; the facts stay.
 */
export function lookupsAsText(messages: ModelMessage[]): ModelMessage[] {
	const calls = new Map<string, { name: string; input: unknown }>();
	const out: ModelMessage[] = [];
	for (const m of messages) {
		if (m.role === 'assistant' && Array.isArray(m.content)) {
			const text = m.content.flatMap((p) => {
				if (p.type === 'tool-call') calls.set(p.toolCallId, { name: p.toolName, input: p.input });
				return p.type === 'text' && p.text.trim() ? [p.text] : [];
			});
			if (text.length) out.push({ role: 'assistant', content: text.join('\n\n') });
		} else if (m.role === 'tool') {
			const results = m.content.flatMap((p) => {
				if (p.type !== 'tool-result') return [];
				const value = 'value' in p.output ? p.output.value : null;
				const call = calls.get(p.toolCallId);
				return [
					`Lookup ${call?.name ?? p.toolName} ${JSON.stringify(call?.input ?? {})} returned: ${
						typeof value === 'string' ? value : JSON.stringify(value)
					}`
				];
			});
			if (results.length) out.push({ role: 'user', content: results.join('\n\n') });
		} else out.push(m);
	}
	return out;
}
