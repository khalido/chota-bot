<script lang="ts">
	let preview = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	async function fetchPreview() {
		loading = true;
		error = null;
		try {
			const r = await fetch('/api/print/morning');
			if (!r.ok) throw new Error(`HTTP ${r.status}`);
			preview = await r.text();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}
</script>

<section
	class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
>
	<div class="flex items-center justify-between">
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Print preview — morning
		</h2>
		<button
			type="button"
			onclick={fetchPreview}
			disabled={loading}
			class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
		>
			{loading ? 'Loading...' : 'Preview morning'}
		</button>
	</div>

	{#if error}
		<p class="mt-3 text-sm text-red-600 dark:text-red-400">Error: {error}</p>
	{:else if preview}
		<pre
			class="mt-3 overflow-auto rounded-md bg-slate-50 p-3 font-mono text-xs whitespace-pre text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{preview}</pre>
	{:else}
		<p class="mt-3 text-sm text-slate-500 dark:text-neutral-500">
			Click "Preview morning" to render what would print at 07:00.
		</p>
	{/if}
</section>
