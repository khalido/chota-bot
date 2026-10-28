/**
 * The turn's step budget, and the last step that has to answer.
 *
 * The SDK stops at 20 steps by default, and a model still calling tools then
 * ends with an empty reply. The cap is pinned here so the last-step rule stays
 * in step with it: on the final step the tools are taken away and the model is
 * told to answer from what it found.
 *
 * Ported from syntechfibres `agent/loop-guard.ts` (answerWhenDone,
 * lookupsAsText). There, GLM still wrote one more tool call out as text when
 * its history held tool calls, so the final step sees every lookup rewritten
 * as plain text.
 */
import { isStepCount, type Instructions, type ModelMessage } from 'ai';

/** Steps per turn. Generous: a WhatsApp turn shows each tool's emoji as it goes. */
export const MAX_STEPS = 20;

export const STOP_WHEN = isStepCount(MAX_STEPS);

/** Said to the model on the step where its tools are taken away. */
export const ANSWER_NOW =
	'NO MORE TOOLS: the lookups for this question are over. Write the answer now from the tool ' +
	'results above, in plain text. Say plainly what you could not find. Never write a tool call.';

/** `prepareStep`: on the last step (stepNumber counts from 0), answer without tools. */
export function answerWhenDone({
	stepNumber,
	messages,
	instructions
}: {
	stepNumber: number;
	messages: ModelMessage[];
	instructions: Instructions | undefined;
}) {
	if (stepNumber < MAX_STEPS - 1) return {};
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
