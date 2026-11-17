// Sender side: one payload as the messages to send, each under LIMITS.partBytes once encoded. Plain TypeScript; a
// sender can copy it with the two constants it imports.
import { LIMITS, VERSION, type MessageType } from './schema.ts';

export type Outgoing = {
	v: 1;
	id: string;
	type: MessageType;
	revision: number;
	seq: number;
	total: number;
	data?: unknown;
	chunk?: string;
};

const bytes = (m: unknown) => new TextEncoder().encode(JSON.stringify(m)).length;

/**
 * The messages that carry `data` as `type`. One message when it fits; otherwise slices of its JSON in `chunk`, each
 * envelope (with JSON escaping and UTF-8) at most `maxBytes`. Send them in order on the namespace.
 */
export function split(
	type: MessageType,
	data: unknown,
	{
		id = crypto.randomUUID(),
		revision = Date.now(),
		maxBytes = LIMITS.partBytes as number
	}: { id?: string; revision?: number; maxBytes?: number } = {}
): Outgoing[] {
	const head = { v: VERSION as 1, id, type, revision };
	const whole: Outgoing = { ...head, seq: 0, total: 1, data };
	if (bytes(whole) <= maxBytes) return [whole];

	// Room for the chunk in each envelope, with digits for seq and total to spare.
	const room = maxBytes - bytes({ ...head, seq: 99_999, total: 99_999, chunk: '' });
	if (room < 64) throw new Error(`maxBytes ${maxBytes} leaves no room for a chunk`);
	const json = JSON.stringify(data);
	const chunks: string[] = [];
	for (let at = 0; at < json.length;) {
		let end = Math.min(json.length, at + room);
		// Shrink until the slice fits once escaped and encoded; never split a surrogate pair.
		for (;;) {
			if (end < json.length && /[\uD800-\uDBFF]/.test(json[end - 1])) end--;
			const size = bytes(json.slice(at, end));
			if (size <= room) break;
			end = at + Math.max(1, Math.floor((end - at) * (room / size) * 0.98));
		}
		chunks.push(json.slice(at, end));
		at = end;
	}
	return chunks.map((chunk, seq) => ({ ...head, seq, total: chunks.length, chunk }));
}
