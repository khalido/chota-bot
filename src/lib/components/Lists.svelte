<script lang="ts">
	import type { ProjectWithTasks } from '$lib/server/tools/ticktick';
	import { resolve } from '$app/paths';

	let { lists }: { lists: ProjectWithTasks[] } = $props();

	// Trimmed like the print brief: the shopping list in full, plus anything
	// with a due date from the other lists. The rest (Watch, Buying, Notes…)
	// stays a tap away on /lists.
	const isShopping = (l: ProjectWithTasks) => l.project.name.toLowerCase().includes('shopping');
	const shopping = $derived(lists.find(isShopping)?.tasks.map((t) => t.title) ?? []);
	const due = $derived(
		lists.filter((l) => !isShopping(l)).flatMap((l) => l.tasks.filter((t) => t.dueDate))
	);
</script>

<a
	href={resolve('/lists')}
	class="block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-neutral-900 dark:ring-neutral-800 dark:hover:ring-neutral-700"
>
	<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
		Lists
	</h2>

	{#if shopping.length === 0 && due.length === 0}
		<p class="mt-3 text-sm text-slate-400 italic dark:text-neutral-500">Nothing on the lists.</p>
	{:else}
		{#if shopping.length > 0}
			<div class="mt-3">
				<div
					class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-neutral-600"
				>
					Shopping
				</div>
				<p class="mt-0.5 text-sm text-slate-600 dark:text-neutral-400">{shopping.join(' · ')}</p>
			</div>
		{/if}
		{#if due.length > 0}
			<div class="mt-3">
				<div
					class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-neutral-600"
				>
					Due
				</div>
				<ul class="mt-0.5 space-y-0.5">
					{#each due as t (t.id)}
						<li class="text-sm text-slate-600 dark:text-neutral-400">{t.title}</li>
					{/each}
				</ul>
			</div>
		{/if}
	{/if}
</a>
