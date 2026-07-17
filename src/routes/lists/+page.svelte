<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function priorityLabel(p: number): string {
		return p >= 5 ? '!!!' : p >= 3 ? '!!' : p >= 1 ? '!' : '';
	}

	// TickTick glues the list's emoji icon onto the name ("🛒Shopping") — split it back out.
	function splitName(name: string): { icon: string; label: string } {
		const icon = /^[^\p{L}\p{N}]+/u.exec(name)?.[0]?.trim() ?? '';
		return { icon, label: name.slice(icon.length).trim() || name };
	}
</script>

<svelte:head><title>Chota — Lists</title></svelte:head>

<div class="min-h-screen bg-slate-100 p-6 dark:bg-neutral-950">
	<header class="mx-auto mb-6 flex max-w-7xl items-baseline justify-between">
		<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Lists</h1>
		<a
			href={resolve('/')}
			class="text-sm text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
			>← back</a
		>
	</header>

	{#if !data.configured}
		<p class="text-sm text-slate-500 italic dark:text-neutral-500">
			No TickTick lists configured. Set <code>ticktick.lists</code> in <code>chota.config.ts</code>.
		</p>
	{:else if data.error}
		<p class="text-sm text-amber-600 italic dark:text-amber-400">
			Couldn't reach TickTick — {data.error}
		</p>
	{:else if data.lists.length === 0}
		<p class="text-sm text-slate-500 italic dark:text-neutral-500">
			Configured, but no matching lists found in TickTick. Check the names in
			<code>ticktick.lists</code> match your list names exactly.
		</p>
	{:else}
		<div
			class="mx-auto grid max-w-7xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
		>
			{#each data.lists as l (l.project.id)}
				{@const nm = splitName(l.project.name)}
				<section
					class="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
				>
					<div class="mb-3 flex items-baseline justify-between gap-2">
						<h2
							class="flex items-baseline gap-2 text-base font-medium text-slate-800 dark:text-neutral-100"
						>
							{#if nm.icon}<span class="text-lg">{nm.icon}</span>{/if}
							<span>{nm.label}</span>
						</h2>
						<span class="text-xs text-slate-400 dark:text-neutral-500">{l.tasks.length}</span>
					</div>

					{#if l.tasks.length === 0}
						<p class="text-xs text-slate-400 italic dark:text-neutral-600">empty</p>
					{:else}
						<ul class="space-y-1.5">
							{#each l.tasks as t (t.id)}
								<li class="text-sm text-slate-700 dark:text-neutral-300">
									{#if t.priority >= 1}
										<span class="mr-1 font-mono text-xs text-amber-600 dark:text-amber-400"
											>{priorityLabel(t.priority)}</span
										>
									{/if}
									{t.title}
									{#if t.tags && t.tags.length > 0}
										{#each t.tags as tag (tag)}
											<span
												class="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-neutral-800 dark:text-neutral-400"
												>{tag}</span
											>
										{/each}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if l.done.length > 0}
						<div class="mt-3 border-t border-slate-100 pt-3 dark:border-neutral-800">
							<p
								class="mb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-neutral-600"
							>
								Recently done
							</p>
							<ul class="space-y-1">
								{#each l.done as t (t.id)}
									<li
										class="flex items-baseline justify-between gap-2 text-xs text-slate-400 dark:text-neutral-500"
									>
										<span class="truncate line-through">{t.title}</span>
										<span class="shrink-0">{t.when}</span>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</section>
			{/each}
		</div>
	{/if}
</div>
