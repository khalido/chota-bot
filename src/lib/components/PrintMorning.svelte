<script lang="ts">
	// Dashboard widget: preview any family member's printed brief as plain text.
	// Before midday it previews today's (morning) brief; after midday, tomorrow's
	// (the evening print) — the same names, the day that's actually relevant.
	let { recipients }: { recipients: readonly string[] } = $props();

	let preview = $state<string | null>(null);
	let current = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	const title = (who: string) => who[0].toUpperCase() + who.slice(1);
	/** Which brief to preview: today's before noon, tomorrow's after. */
	const briefDay = (): 'today' | 'tomorrow' => (new Date().getHours() < 12 ? 'today' : 'tomorrow');

	async function fetchPreview(who: string) {
		loading = true;
		error = null;
		current = who;
		try {
			const query = briefDay() === 'tomorrow' ? '?day=tomorrow' : '';
			const r = await fetch(`/api/print/${who}${query}`);
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			preview = await r.text();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			preview = null;
		} finally {
			loading = false;
		}
	}
</script>

<section
	class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
>
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Print preview — {briefDay() === 'tomorrow' ? 'tomorrow' : 'today'}
		</h2>
		<div class="flex flex-wrap gap-1.5">
			{#each recipients as who (who)}
				<button
					type="button"
					onclick={() => fetchPreview(who)}
					disabled={loading}
					class="rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 {current === who
						? 'bg-slate-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
						: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700'}"
				>
					{loading && current === who ? 'Loading...' : title(who)}
				</button>
			{/each}
		</div>
	</div>

	{#if error}
		<p class="mt-3 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
	{:else if preview}
		<pre
			class="mt-3 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs whitespace-pre text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{preview}</pre>
	{:else}
		<p class="mt-3 text-sm text-slate-500 dark:text-neutral-500">
			Pick a name to preview {briefDay() === 'tomorrow' ? "tomorrow's" : "today's"} printed brief.
		</p>
	{/if}
</section>
