<script lang="ts">
	import type { ChoreAssignment } from '$lib/server/chores';
	let { chores }: { chores: ChoreAssignment[] } = $props();
</script>

<section
	class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
>
	<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
		Chores today
	</h2>

	{#if chores.length === 0}
		<p class="mt-3 text-sm text-slate-400 italic dark:text-neutral-500">No chores today.</p>
	{:else}
		<ul class="mt-3 space-y-2">
			{#each chores as item (item.person)}
				<li class="text-sm">
					<span class="font-medium text-slate-700 dark:text-neutral-200">{item.person}:</span>
					<span class="text-slate-600 dark:text-neutral-400">{item.chores.join(', ')}</span>
				</li>
			{/each}
		</ul>
	{/if}
</section>
