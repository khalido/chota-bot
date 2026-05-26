<script lang="ts">
	import { resolve } from '$app/paths';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import { ButtonGroup } from '$lib/components/ui/button-group';
	import BriefSheet from '$lib/components/print/BriefSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let printing = $state<string | null>(null);
	let result = $state<string | null>(null);

	// Tab-style nav, three views. Today/Tomorrow toggle the multi-person
	// preview's day param; Weekend jumps to the family whole-household sheet
	// at /print/family — a different route + render, hence a navigation,
	// not a URL-param swap.
	const dayTabs = [
		{ label: 'Today', href: resolve('/print'), active: () => data.day === 'today' },
		{ label: 'Tomorrow', href: resolve('/print') + '?day=tomorrow', active: () => data.day === 'tomorrow' },
		{ label: 'Weekend', href: resolve('/print/[who]', { who: 'family' }), active: () => false }
	];

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
	<header class="mb-6 flex flex-wrap items-center justify-between gap-3">
		<div class="flex flex-wrap items-baseline gap-3">
			<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">
				Print preview
			</h1>
			<span class="text-sm text-slate-500 dark:text-neutral-500">
				{data.briefs.length} brief{data.briefs.length === 1 ? '' : 's'} · {data.date}
			</span>
			{#if result}
				<span class="font-mono text-xs text-slate-600 dark:text-neutral-400">{result}</span>
			{/if}
		</div>

		<!--
		  Day toggle. Buttons-as-links so the URL is the source of truth (back
		  button works, sharing a URL preserves the view). Touch-friendly: 44px
		  hit targets via `h-11 px-5` — fingers, not pixels, drive the kiosk
		  display.
		-->
		<ButtonGroup>
			{#each dayTabs as tab (tab.label)}
				<a
					href={tab.href}
					data-active={tab.active() ? '' : undefined}
					class="inline-flex h-11 items-center justify-center px-5 text-sm font-medium border border-input bg-background hover:bg-accent hover:text-accent-foreground first:rounded-l-md last:rounded-r-md -ml-px first:ml-0 data-[active]:bg-primary data-[active]:text-primary-foreground data-[active]:hover:bg-primary/90 transition-colors"
				>
					{tab.label}
				</a>
			{/each}
		</ButtonGroup>
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
						who={b.who}
						date={data.date}
						sections={b.sections}
						closing={data.closing}
						printedAt={data.printedAt}
					/>
				</div>
			</div>
		{/each}
	</div>
</div>
