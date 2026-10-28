/**
 * The one place chota asks a decision model (Jev, via AI Gateway) a typed
 * question. Callers treat a throw as "no suggestion" — Jev is a network call
 * that fails now and then (everx saw one request in three at times).
 * See the decision-models skill and docs/agent.md §Decisions.
 */
import { createHash } from 'node:crypto';
import { experimental_decide as decide, gateway } from 'ai';
import type { Experimental_DecisionQuestion as Question } from 'ai';
import { log } from '$lib/server/log';

export type { Question };

/** Stable hash of the question text, stored with every verdict. */
export const questionsHash = (questions: unknown) =>
	createHash('sha256').update(JSON.stringify(questions)).digest('hex').slice(0, 12);

/** Ask one choice question; returns its probabilities and the model that answered. */
export async function decideChoice(
	label: string,
	model: string,
	state: Record<string, unknown>,
	question: Question & { type: 'choice' }
): Promise<{ probabilities: Record<string, number>; pick: string; model: string }> {
	const started = Date.now();
	const result = await decide({
		model: gateway.decisionModel(model),
		// The SDK rejects undefined anywhere in state; a JSON round trip drops it.
		state: JSON.parse(JSON.stringify(state)),
		questions: { q: question },
		maxRetries: 1,
		abortSignal: AbortSignal.timeout(10_000)
	});
	const answer = result.answers.q;
	if (answer?.type !== 'choice') throw new Error(`decide ${label}: no choice answer`);
	const probabilities = (answer.probabilities ?? { [answer.choice]: 1 }) as Record<string, number>;
	log(
		'decide',
		`${label}: ${answer.choice} ${(probabilities[answer.choice] ?? 0).toFixed(2)} in ${Date.now() - started}ms (${result.response.modelId})`
	);
	return { probabilities, pick: answer.choice, model: result.response.modelId };
}

/**
 * Ask several yes/no questions about one state in a single call; returns
 * P(yes) for each key. A key Jev refused or skipped is left out.
 */
export async function decideBooleans(
	label: string,
	model: string,
	state: Record<string, unknown>,
	questions: Record<string, Question & { type: 'boolean' }>
): Promise<{ probabilities: Record<string, number>; model: string }> {
	const started = Date.now();
	const result = await decide({
		model: gateway.decisionModel(model),
		state: JSON.parse(JSON.stringify(state)),
		questions,
		maxRetries: 1,
		abortSignal: AbortSignal.timeout(15_000)
	});
	const probabilities: Record<string, number> = {};
	for (const [key, answer] of Object.entries(result.answers)) {
		if (answer?.type === 'boolean') probabilities[key] = answer.probability;
	}
	log(
		'decide',
		`${label}: ${Object.keys(probabilities).length} answers in ${Date.now() - started}ms (${result.response.modelId})`
	);
	return { probabilities, model: result.response.modelId };
}
