<script lang="ts">
	import { onMount } from 'svelte';
	import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '$lib/components/ui/empty';
	import { Button } from '$lib/components/ui/button';
	import type { PageData } from './$types';
	import type { LogEntry } from '../../api/admin/logs/+server';

	let { data }: { data: PageData } = $props();

	// Reactive entries — initial set from the server load, replaced by the
	// poll. `data.entries` / `data.total` only seed on first paint;
	// subsequent updates land via fetch + assignment in poll().
	// svelte-ignore state_referenced_locally
	let entries = $state<LogEntry[]>(data.entries);
	// svelte-ignore state_referenced_locally
	let total = $state(data.total);
	let lastPoll = $state(new Date());
	let polling = $state(false);
	let level = $state<'ALL' | 'INFO' | 'WARN' | 'ERROR'>('ALL');

	const filtered = $derived(level === 'ALL' ? entries : entries.filter((e) => e.level === level));

	async function poll() {
		if (polling) return;
		polling = true;
		try {
			const r = await fetch('/api/admin/logs?lines=200');
			if (r.ok) {
				const body = await r.json();
				entries = body.entries;
				total = body.total;
				lastPoll = new Date();
			}
		} finally {
			polling = false;
		}
	}

	// Auto-refresh every 30s, but only while this tab is the user's foreground
	// tab — when they switch away (kiosk dashboard, another browser tab), we
	// pause to save network + render churn. Visibility-aware polling.
	onMount(() => {
		let intervalId: ReturnType<typeof setInterval> | null = null;

		const start = () => {
			if (intervalId) return;
			intervalId = setInterval(poll, 30_000);
		};
		const stop = () => {
			if (intervalId) clearInterval(intervalId);
			intervalId = null;
		};

		const visibility = () => (document.hidden ? stop() : start());
		document.addEventListener('visibilitychange', visibility);
		start();

		return () => {
			stop();
			document.removeEventListener('visibilitychange', visibility);
		};
	});

	function levelClass(l: string): string {
		switch (l) {
			case 'ERROR':
				return 'text-red-600 dark:text-red-400';
			case 'WARN':
				return 'text-amber-600 dark:text-amber-400';
			case 'DEBUG':
				return 'text-slate-400 dark:text-neutral-600';
			default:
				return 'text-slate-500 dark:text-neutral-500';
		}
	}

	function justTime(iso: string): string {
		if (!iso) return '';
		const d = new Date(iso);
		if (isNaN(d.getTime())) return '';
		return d.toLocaleTimeString('en-AU', {
			timeZone: 'Australia/Sydney',
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit',
			hour12: false
		});
	}
</script>

<svelte:head><title>Chota — admin · logs</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6">
	<header class="mb-4 flex flex-wrap items-baseline gap-3">
		<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Logs</h1>
		<span class="text-sm text-slate-500 dark:text-neutral-500">
			tail · {filtered.length} of {entries.length} loaded · {total} on disk
		</span>
		<span class="ml-auto text-xs text-slate-500 dark:text-neutral-500">
			last poll {justTime(lastPoll.toISOString())}{polling ? ' · polling…' : ''}
		</span>
	</header>

	<div class="mb-3 flex flex-wrap items-center gap-2">
		{#each ['ALL', 'INFO', 'WARN', 'ERROR'] as const as l (l)}
			<Button variant={level === l ? 'default' : 'outline'} size="sm" onclick={() => (level = l)}>
				{l}
			</Button>
		{/each}
		<Button variant="ghost" size="sm" onclick={poll} disabled={polling}>refresh now</Button>
	</div>

	{#if filtered.length === 0}
		<Empty>
			<EmptyHeader>
				<EmptyTitle>No matching log lines</EmptyTitle>
				<EmptyDescription>
					{#if level === 'ALL'}
						The log file is empty or unreadable. Check <code>data/logs/chota.log</code> exists + has content.
					{:else}
						No <code>{level}</code> entries in the last {entries.length} lines.
					{/if}
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	{:else}
		<!--
		  Plain monospace tail. Each row: time · level · scope · message.
		  Click a row to toggle the `properties` JSON below it. Keeping the
		  detail render inline (no popover) so users can compare adjacent
		  events without losing the tail context.
		-->
		<div
			class="overflow-x-auto rounded-md border border-slate-200 bg-white text-xs dark:border-neutral-800 dark:bg-neutral-950"
		>
			<table class="w-full font-mono">
				<tbody>
					{#each filtered as e, i (i)}
						<tr class="border-b border-slate-100 last:border-b-0 dark:border-neutral-900">
							<td class="w-20 px-3 py-1 text-slate-400 dark:text-neutral-600"
								>{justTime(e.timestamp)}</td
							>
							<td class={['w-14 px-1 py-1', levelClass(e.level)]}>{e.level}</td>
							<td class="w-32 truncate px-2 py-1 text-slate-500 dark:text-neutral-500"
								>{e.logger}</td
							>
							<td class="px-2 py-1 text-slate-800 dark:text-neutral-200">{e.message}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	<p class="mt-4 text-xs text-slate-500 dark:text-neutral-500">
		Auto-refreshes every 30s while this tab is focused. Source:
		<code>data/logs/chota.log</code> (JSON lines, LogTape rotating sink).
	</p>
</div>
