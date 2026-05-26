<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import BriefSheet from '$lib/components/print/BriefSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let printing = $state<string | null>(null);
	let result = $state<string | null>(null);

	// Re-run +page.server.ts.load() every minute. Tools return cached data
	// (warmed by the *-refresh jobs), so this is cheap — keeps the preview
	// fresh as weather / bus / calendar tick over through the day. Same
	// pattern as the main dashboard at /.
	onMount(() => {
		const refresh = setInterval(() => invalidateAll(), 60_000);
		return () => clearInterval(refresh);
	});

	async function print(who: string) {
		printing = who;
		result = null;
		try {
			const b = await (await fetch(`/api/print/${who}?mode=image`, { method: 'POST' })).json();
			result = b.ok ? `✓ ${who}: ${b.bytes}b` : `✗ ${who}: ${b.error ?? 'failed'}`;
		} catch (e) {
			result = `✗ ${who}: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			printing = null;
		}
	}
</script>

<svelte:head><title>Chota — Print preview</title></svelte:head>

<div class="min-h-screen bg-slate-200 p-8 dark:bg-neutral-950">
	<header class="mb-6 flex flex-wrap items-baseline gap-3">
		<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">
			Print preview
		</h1>
		<span class="text-sm text-slate-500 dark:text-neutral-500">
			{data.briefs.length} brief{data.briefs.length === 1 ? '' : 's'} · {data.date}
		</span>
		{#if result}
			<span class="font-mono text-xs text-slate-600 dark:text-neutral-400">{result}</span>
		{/if}
	</header>

	<div class="flex items-start gap-8 overflow-x-auto pb-4">
		{#each data.briefs as b (b.who)}
			<div class="shrink-0">
				<div
					class="flex items-center justify-between gap-3 bg-slate-800 px-3 py-1.5 text-slate-100"
				>
					<span class="text-xs font-semibold tracking-wider uppercase">{b.who}</span>
					<div class="flex items-center gap-3">
						<a
							class="text-xs text-slate-300 hover:text-white"
							href={resolve('/print/[who]', { who: b.who })}
						>
							open
						</a>
						<button
							type="button"
							onclick={() => print(b.who)}
							disabled={printing !== null}
							class="rounded bg-white px-2 py-0.5 text-xs font-semibold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
						>
							{printing === b.who ? 'printing…' : 'print'}
						</button>
					</div>
				</div>
				<div class="shadow-lg">
					<BriefSheet
						date={data.date}
						mark={b.mark}
						sections={b.sections}
						closing={data.closing}
						printedAt={data.printedAt}
					/>
				</div>
			</div>
		{/each}
	</div>
</div>
