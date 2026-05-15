<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	function fmtTime(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString('en-AU', {
			timeZone: 'Australia/Sydney',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			day: '2-digit',
			month: 'short'
		});
	}

	function fmtAgo(iso: string | null): string {
		if (!iso) return '';
		const ms = Date.now() - new Date(iso).getTime();
		const s = Math.round(ms / 1000);
		if (s < 60) return `${s}s ago`;
		const m = Math.round(s / 60);
		if (m < 60) return `${m}m ago`;
		return `${Math.round(m / 60)}h ago`;
	}

	function statusColor(s: string): string {
		if (s === 'ok') return 'text-emerald-600 dark:text-emerald-400';
		if (s === 'error') return 'text-red-600 dark:text-red-400';
		return 'text-slate-400 dark:text-neutral-500';
	}
</script>

<svelte:head><title>Chota — Jobs</title></svelte:head>

<div class="mx-auto min-h-screen max-w-5xl space-y-6 bg-slate-100 p-6 dark:bg-neutral-950">
	<header class="flex items-baseline justify-between">
		<div>
			<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Jobs</h1>
			<p class="text-sm text-slate-500 dark:text-neutral-500">
				{data.jobs.length} registered · in-memory history (resets on restart)
			</p>
		</div>
		<a
			href={resolve('/admin')}
			class="text-sm text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
			>← admin</a
		>
	</header>

	{#each data.jobs as j (j.name)}
		<section
			class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
		>
			<header class="flex items-baseline justify-between">
				<div>
					<h3 class="text-base font-medium text-slate-800 dark:text-neutral-100">
						{j.name}
						{#if j.isRunning}
							<span
								class="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
								>RUNNING</span
							>
						{/if}
					</h3>
					<p class="font-mono text-xs text-slate-500 dark:text-neutral-500">
						{j.pattern}
					</p>
				</div>
				<div class="text-right text-xs">
					<div class="text-slate-400 dark:text-neutral-500">
						next: <span class="text-slate-700 dark:text-neutral-300"
							>{fmtTime(j.nextRun)}</span
						>
					</div>
					<div class="text-slate-400 dark:text-neutral-500">
						last: {fmtAgo(j.previousRun)}
					</div>
				</div>
			</header>

			{#if j.recent.length > 0}
				<table class="mt-3 w-full text-xs">
					<thead>
						<tr class="text-left text-slate-400 dark:text-neutral-500">
							<th class="py-1 font-normal">when</th>
							<th class="py-1 font-normal">status</th>
							<th class="py-1 font-normal">duration</th>
							<th class="py-1 font-normal">notes</th>
						</tr>
					</thead>
					<tbody class="font-mono">
						{#each j.recent as r (r.at)}
							<tr class="border-t border-slate-100 dark:border-neutral-800">
								<td class="py-1 text-slate-700 dark:text-neutral-300">{fmtTime(r.at)}</td>
								<td class="py-1 {statusColor(r.status)}">{r.status}</td>
								<td class="py-1 text-slate-500 dark:text-neutral-500">{r.durationMs}ms</td>
								<td class="py-1 text-slate-500 dark:text-neutral-500">{r.error ?? ''}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{:else}
				<p class="mt-3 text-xs text-slate-400 italic dark:text-neutral-600">no runs yet</p>
			{/if}
		</section>
	{/each}
</div>
