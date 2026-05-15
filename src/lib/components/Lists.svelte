<script lang="ts">
	import type { ProjectWithTasks } from '$lib/server/tools/ticktick';
	import { resolve } from '$app/paths';

	let { lists }: { lists: ProjectWithTasks[] } = $props();

	const RECENT = 3;

	// TickTick returns tasks in their list order; just take the first N. When we
	// add createdTime to the Task type (TickTick has it; we just don't expose
	// it yet), we can sort newest-first here.
	function recentTitles(tasks: { title: string }[]) {
		return tasks.slice(0, RECENT).map((t) => t.title);
	}
</script>

<a
	href={resolve('/lists')}
	class="block rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:ring-slate-300 dark:bg-neutral-900 dark:ring-neutral-800 dark:hover:ring-neutral-700"
>
	<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
		Lists
	</h2>

	{#if lists.length === 0}
		<p class="mt-3 text-sm text-slate-400 italic dark:text-neutral-500">
			No lists configured.
		</p>
	{:else}
		<div class="mt-3 space-y-3">
			{#each lists as l (l.project.id)}
				<div>
					<div class="flex items-baseline gap-2">
						<span class="text-sm font-medium text-slate-700 dark:text-neutral-200">
							{l.project.name}
						</span>
						<span class="text-xs text-slate-400 dark:text-neutral-500">
							{l.tasks.length}
						</span>
					</div>
					{#if l.tasks.length > 0}
						<p class="mt-0.5 truncate text-xs text-slate-500 dark:text-neutral-500">
							{recentTitles(l.tasks).join(' · ')}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</a>
