/**
 * One agent turn per thread at a time (grammY's `sequentialize` idea, and
 * Chat SDK's `queue` strategy). A message that arrives while its thread is
 * busy waits; when the turn ends, the newest waiting message runs with the
 * ones it overtook passed along as `skipped`, so a burst ("milk" / "and
 * bread" / "oh and eggs") becomes one turn that sees all three. Different
 * threads run in parallel.
 */
export type TurnHandler<T> = (latest: T, skipped: T[]) => Promise<void>;

export class ThreadQueue<T> {
	private busy = new Set<string>();
	private waiting = new Map<string, T[]>();
	private running = new Set<Promise<void>>();

	constructor(private handle: TurnHandler<T>) {}

	/** Queue `item` on `threadId`. Resolves when its turn ends — or at once if
	 *  the thread is busy (it then runs later, or rides along as skipped). */
	push(threadId: string, item: T): Promise<void> {
		if (this.busy.has(threadId)) {
			const list = this.waiting.get(threadId) ?? [];
			list.push(item);
			this.waiting.set(threadId, list);
			return Promise.resolve();
		}
		return this.run(threadId, item, []);
	}

	private async run(threadId: string, latest: T, skipped: T[]): Promise<void> {
		this.busy.add(threadId);
		const turn = this.handle(latest, skipped).catch(() => {
			// The handler logs and replies its own errors; a throw must not
			// wedge the thread.
		});
		this.running.add(turn);
		try {
			await turn;
		} finally {
			this.running.delete(turn);
			this.busy.delete(threadId);
		}
		const next = this.waiting.get(threadId);
		if (next?.length) {
			this.waiting.delete(threadId);
			await this.run(threadId, next.at(-1)!, next.slice(0, -1));
		}
	}

	/** Wait for every running turn (shutdown). Waiting items are dropped. */
	async drain(): Promise<void> {
		this.waiting.clear();
		await Promise.allSettled([...this.running]);
	}
}
