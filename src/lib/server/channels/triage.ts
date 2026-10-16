/**
 * Pipeline step 3 (docs/agent.md §Channels): a family-group message that
 * doesn't tag the bot gets one Jev judgment — is it something for the lists?
 * Question and threshold live in `decisions/group-triage.json`; every verdict
 * is stored in the `decision` table. A throw (Jev down) means no suggestion.
 */
import { generateId, generateText, Output } from 'ai';
import { z } from 'zod';
import { db } from '$lib/server/db';
import { decision } from '$lib/server/db/schema';
import { decideChoice, questionsHash, type Question } from '$lib/server/decide';
import { logErr } from '$lib/server/log';
import spec from '$lib/server/decisions/group-triage.json';
import type { Incoming } from './types';

const KIND = 'group-triage';
const question = spec.question as Question & { type: 'choice' };
const hash = questionsHash(question);

export interface TriageHit {
	kind: string;
	probability: number;
}

/** Judge one untagged group message against the recent lines for context. */
export async function triage(m: Incoming, recent: string[]): Promise<TriageHit | null> {
	try {
		const { probabilities, pick, model } = await decideChoice(
			KIND,
			spec.model,
			{ latest: `${m.person?.name ?? m.senderName}: ${m.text}`, recent },
			question
		);
		const probability = probabilities[pick] ?? 0;
		const acted = spec.act.includes(pick) && probability >= spec.threshold;
		db.insert(decision)
			.values({
				id: generateId(),
				kind: KIND,
				threadId: m.threadId,
				messageId: m.messageId,
				model,
				questionsHash: hash,
				probabilities: JSON.stringify(probabilities),
				pick,
				acted
			})
			.run();
		return acted ? { kind: pick, probability } : null;
	} catch (err) {
		logErr('triage', 'group triage failed — no suggestion', err);
		return null;
	}
}

/** The note the agent gets with a triaged message (this turn only, not history). */
export const triageHint = (hit: TriageHit) =>
	`[Not addressed to you. A classifier thinks this is a ${hit.kind.replaceAll('_', ' ')} (${hit.probability.toFixed(2)}). If it is, do it with the list tools. Nobody sees your reply in the group — only a reaction showing what you did — so keep it to a few words. If it isn't, do nothing.]`;

/**
 * The cheap gate for an untagged group photo: Jev can't see images through
 * the Gateway, so a small vision model answers one yes/no — is there
 * something here for the lists (a flyer, notice, schedule, something to
 * buy)? Only a yes costs a full agent turn; holiday snaps stop here. A
 * failure is a no.
 */
const PHOTO_MODEL = 'google/gemini-3.5-flash-lite';

export async function photoIsActionable(image: Buffer, mediaType: string, caption: string) {
	try {
		const { output } = await generateText({
			model: PHOTO_MODEL,
			output: Output.object({
				schema: z.object({
					actionable: z
						.boolean()
						.describe(
							'True only for an event flyer, school or club notice, schedule, invitation, receipt or a photo of something to buy. False for ordinary photos of people, places, food, pets.'
						)
				})
			}),
			messages: [
				{
					role: 'user',
					content: [
						{
							type: 'text',
							text: `A photo posted in a family group chat.${caption ? ` Caption: ${caption}` : ''}`
						},
						{ type: 'file', data: image, mediaType }
					]
				}
			],
			abortSignal: AbortSignal.timeout(20_000)
		});
		return output.actionable;
	} catch (err) {
		logErr('triage', 'photo gate failed — treating as not actionable', err);
		return false;
	}
}
