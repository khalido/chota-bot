<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let printing = $state<string | null>(null);
	let result = $state<string | null>(null);

	function imgSrc(kind: string): string {
		return `/api/print/${kind}?format=png`;
	}

	async function fire(kind: string, label: string, query: string) {
		printing = label;
		result = null;
		try {
			const res = await fetch(`/api/print/${kind}${query}`, { method: 'POST' });
			const b = await res.json();
			const meta = b.lines != null ? `${b.lines} lines, ${b.bytes}b` : `${b.bytes}b`;
			result = b.ok ? `✓ ${label}: ${meta} (${b.mode})` : `✗ ${label}: ${b.error ?? 'failed'}`;
		} catch (e) {
			result = `✗ ${label}: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			printing = null;
		}
	}
</script>

<svelte:head><title>Chota — Print preview</title></svelte:head>

<div class="mx-auto min-h-screen max-w-6xl space-y-6 bg-slate-100 p-6 dark:bg-neutral-950">
	<header class="flex items-baseline justify-between">
		<div>
			<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">
				Print preview
			</h1>
			<p class="text-sm text-slate-500 dark:text-neutral-500">
				Plain text (debug) + rendered image, side by side. Buttons send to the printer.
			</p>
		</div>
		<a
			href={resolve('/admin')}
			class="text-sm text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
			>← admin</a
		>
	</header>

	{#if result}
		<section
			class="rounded-xl bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
		>
			<span class="font-mono text-xs text-slate-600 dark:text-neutral-400">{result}</span>
		</section>
	{/if}

	{#each data.kinds as kind (kind)}
		<section
			class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
		>
			<div class="mb-3 flex flex-wrap items-center gap-2">
				<h2
					class="mr-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500"
				>
					{kind}
				</h2>
				<button
					type="button"
					disabled={printing !== null}
					onclick={() => fire(kind, `${kind}-A`, '')}
					class="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
					>{printing === `${kind}-A` ? '...' : 'print text A'}</button
				>
				<button
					type="button"
					disabled={printing !== null}
					onclick={() => fire(kind, `${kind}-B`, '?font=b')}
					class="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
					>{printing === `${kind}-B` ? '...' : 'print text B'}</button
				>
				<button
					type="button"
					disabled={printing !== null}
					onclick={() => fire(kind, `${kind}-mix`, '?mix=1')}
					class="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
					>{printing === `${kind}-mix` ? '...' : 'print text mixed'}</button
				>
				<button
					type="button"
					disabled={printing !== null}
					onclick={() => fire(kind, `${kind}-img`, '?mode=image')}
					class="rounded-md bg-emerald-700 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
					>{printing === `${kind}-img` ? '...' : 'print image'}</button
				>
			</div>

			<div class="grid gap-5 md:grid-cols-2">
				<pre
					class="overflow-auto rounded bg-slate-50 p-3 font-mono text-xs leading-snug text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{data
						.texts[kind]}</pre>
				<div class="overflow-auto rounded bg-slate-50 p-3 dark:bg-neutral-950">
					<img
						src={imgSrc(kind)}
						alt="{kind} render"
						class="mx-auto block bg-white shadow"
						style="image-rendering: pixelated;"
					/>
				</div>
			</div>
		</section>
	{/each}
</div>
