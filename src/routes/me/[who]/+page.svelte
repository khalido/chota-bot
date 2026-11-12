<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.name} — Chota</title>
</svelte:head>

<main
	class="mx-auto min-h-dvh max-w-md bg-stone-50 px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] text-stone-900 dark:bg-neutral-950 dark:text-neutral-100"
>
	<header class="mb-6">
		<p class="text-sm text-stone-500 dark:text-neutral-400">{data.today}</p>
		<h1 class="text-3xl font-semibold tracking-tight">{data.name}</h1>
	</header>

	<section aria-labelledby="reminders">
		<h2
			id="reminders"
			class="mb-2 text-xs font-medium tracking-wide text-stone-500 uppercase dark:text-neutral-400"
		>
			Reminders
		</h2>
		{#if data.reminders.length === 0}
			<p class="rounded-2xl bg-white p-4 text-stone-500 dark:bg-neutral-900 dark:text-neutral-400">
				None set. Ask Chota: "remind me at 4 to…"
			</p>
		{:else}
			<ul class="space-y-2">
				{#each data.reminders as r, i (r.id)}
					<li
						in:fly={{ y: 12, duration: 250, delay: i * 40 }}
						class="flex min-h-16 items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 dark:bg-neutral-900 dark:ring-neutral-800"
					>
						<span class="text-2xl" aria-hidden="true">{r.repeats ? '🔁' : '⏰'}</span>
						<div class="min-w-0 flex-1">
							<p class="text-lg leading-snug wrap-break-word">{r.text}</p>
							<p class="text-sm text-stone-500 dark:text-neutral-400">
								{r.paused ? 'Paused' : r.when}{r.repeats ? ' · repeats' : ''}{r.everyone
									? ' · everyone'
									: ''}
							</p>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
