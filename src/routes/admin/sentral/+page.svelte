<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '$lib/components/ui/empty';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let refreshing = $state<string | null>(null);
	let result = $state<Record<string, string>>({});

	function ago(iso?: string): string {
		if (!iso) return '—';
		const ms = Date.now() - Date.parse(iso);
		const min = Math.floor(ms / 60_000);
		if (min < 1) return 'just now';
		if (min < 60) return `${min}m ago`;
		const hr = Math.floor(min / 60);
		if (hr < 24) return `${hr}h ago`;
		return `${Math.floor(hr / 24)}d ago`;
	}

	async function refresh(who: string) {
		refreshing = who;
		result[who] = 'refreshing…';
		try {
			const r = await fetch(`/api/admin/sentral/refresh/${encodeURIComponent(who)}`, {
				method: 'POST'
			});
			const body = await r.json();
			result[who] = body.ok
				? `✓ ${body.bytes} bytes · ${body.events} events`
				: `✗ ${body.error ?? 'failed'}`;
			if (body.ok) await invalidateAll(); // refresh the file-state display
		} catch (e) {
			result[who] = `✗ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			refreshing = null;
		}
	}
</script>

<svelte:head><title>Chota — admin · sentral</title></svelte:head>

<div class="mx-auto max-w-5xl px-4 py-6">
	<header class="mb-6">
		<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Sentral</h1>
		<p class="text-sm text-slate-500 dark:text-neutral-500">
			Per-kid timetable cache state. Refresh on demand if the cron hasn't fired yet (next: weekdays
			06:30/07:30/08:30 AEST).
		</p>
	</header>

	{#if data.kids.length === 0}
		<Empty>
			<EmptyHeader>
				<EmptyTitle>No Sentral kids configured</EmptyTitle>
				<EmptyDescription>
					Set <code>SENTRAL_BASE_URL</code> and per-kid <code>SENTRAL_&lt;NAME&gt;_STUDENT_ID</code>
					/
					<code>_EMAIL</code> / <code>_PASSWORD</code> in <code>.env</code>, then restart chota.
				</EmptyDescription>
			</EmptyHeader>
		</Empty>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.kids as kid (kid.who)}
				<Card.Root>
					<Card.Header>
						<Card.Title class="capitalize">{kid.who}</Card.Title>
						<Card.Description>
							{#if kid.ics.exists}
								{kid.ics.events ?? 0} events · {kid.ics.todayPeriods ?? 0} today
							{:else}
								no timetable cached yet
							{/if}
						</Card.Description>
					</Card.Header>
					<Card.Content class="space-y-2 text-sm">
						<div class="flex items-baseline justify-between gap-2">
							<span class="text-slate-500 dark:text-neutral-500">.ics</span>
							<span class="font-mono text-xs">
								{#if kid.ics.exists}
									{ago(kid.ics.mtime)} · {Math.round((kid.ics.bytes ?? 0) / 1024)} KB
								{:else}
									<span class="text-red-600 dark:text-red-400">missing</span>
								{/if}
							</span>
						</div>
						<div class="flex items-baseline justify-between gap-2">
							<span class="text-slate-500 dark:text-neutral-500">cookie</span>
							<span class="font-mono text-xs">
								{#if kid.cookie.exists}
									{ago(kid.cookie.mtime)}
								{:else}
									<span class="text-amber-600 dark:text-amber-400">missing — will log in fresh</span
									>
								{/if}
							</span>
						</div>
						{#if result[kid.who]}
							<div class="pt-1 font-mono text-xs text-slate-600 dark:text-neutral-400">
								{result[kid.who]}
							</div>
						{/if}
					</Card.Content>
					<Card.Footer>
						<Button
							variant="outline"
							size="sm"
							disabled={refreshing !== null}
							onclick={() => refresh(kid.who)}
						>
							{refreshing === kid.who ? 'refreshing…' : 'Refresh now'}
						</Button>
					</Card.Footer>
				</Card.Root>
			{/each}
		</div>

		<p class="mt-6 text-xs text-slate-500 dark:text-neutral-500">
			"Refresh now" runs <code>refreshTimetable(kid)</code>. If the cached cookie is dead, it
			triggers a fresh agent-browser login (5–30s). Background:
			<code>jobs/sentral-refresh.ts</code>.
		</p>
	{/if}
</div>
