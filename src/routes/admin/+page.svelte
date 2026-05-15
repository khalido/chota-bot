<script lang="ts">
	import { resolve } from '$app/paths';
	import { authClient } from '$lib/auth-client';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const session = authClient.useSession();

	async function signInGoogle() {
		await authClient.signIn.social({
			provider: 'google',
			callbackURL: '/admin'
		});
	}

	async function signOut() {
		await authClient.signOut();
		location.reload();
	}

	let printing = $state<string | null>(null);
	let printResult = $state<string | null>(null);

	let pinging = $state(false);
	let pingSummary = $state<string | null>(null);
	let pingJson = $state<string | null>(null);
	async function pingTickTick() {
		pinging = true;
		pingSummary = null;
		pingJson = null;
		try {
			const r = await (await fetch('/api/ticktick/ping')).json();
			pingSummary = r.ok ? `✓ ${r.ms}ms · ${r.projects} projects` : `✗ ${r.ms}ms · ${r.error ?? 'failed'}`;
			pingJson = JSON.stringify(r, null, 2);
		} catch (e) {
			pingSummary = `✗ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			pinging = false;
		}
	}

	// label is just for the busy-state UI; query is appended to the POST URL.
	async function fireRealPrint(kind: 'morning' | 'test', label: string, query = '') {
		printing = label;
		printResult = null;
		try {
			const res = await fetch(`/api/print/${kind}${query}`, { method: 'POST' });
			const body = await res.json();
			const meta = body.lines != null ? `${body.lines} lines, ${body.bytes} bytes` : `${body.bytes} bytes`;
			printResult = body.ok
				? `✓ ${label}: ${meta} (${body.mode})`
				: `✗ ${label}: ${body.error ?? 'failed'}`;
		} catch (e) {
			printResult = `✗ ${label}: ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			printing = null;
		}
	}

	// One-line summaries per section. Falls back to "(error)" or "(empty)"
	// when data isn't shaped right.
	function summarizeWeather(w: unknown): string {
		if (!w || typeof w !== 'object') return '(no data)';
		if ('error' in w) return `error: ${String(w.error)}`;
		const x = w as { tempC: number; condition: string; hourly: unknown[] };
		return `${Math.round(x.tempC)}C ${x.condition} · ${x.hourly?.length ?? 0} hourly`;
	}

	function summarizeTrips(t: unknown): string {
		if (Array.isArray(t)) {
			if (t.length === 0) return '(no trips configured)';
			return t
				.map(
					(r: { kids: string[]; trip: { label: string }; departures: unknown[] }) =>
						`${r.kids.join('+')} ${r.trip.label}: ${r.departures.length}`
				)
				.join(' · ');
		}
		if (t && typeof t === 'object' && 'error' in t) return `error: ${String(t.error)}`;
		return '(no data)';
	}

	function summarizeCalendar(c: unknown): string {
		if (Array.isArray(c)) {
			if (c.length === 0) return '(no events this week)';
			const next = c[0] as { summary: string; start: string };
			return `${c.length} events · next: ${next.summary}`;
		}
		if (c && typeof c === 'object' && 'error' in c) return `error: ${String(c.error)}`;
		return '(no data)';
	}

	function summarizeCalendarList(l: unknown): string {
		if (Array.isArray(l)) return `${l.length} calendars accessible`;
		if (l && typeof l === 'object' && 'error' in l) return `error: ${String(l.error)}`;
		return '(no data)';
	}

	function summarizeChores(c: unknown): string {
		if (Array.isArray(c)) {
			if (c.length === 0) return '(no chores today)';
			return c
				.map((x: { person: string; chores: string[] }) => `${x.person}=${x.chores.join('+')}`)
				.join(' · ');
		}
		return '(no data)';
	}

	function summarizeQuote(q: unknown): string {
		if (!q || typeof q !== 'object') return '(no quote)';
		const x = q as { author?: string; title?: string };
		return `${x.author ?? '?'} — ${x.title ?? '?'}`;
	}

	function summarizeConfig(c: unknown): string {
		if (!c || typeof c !== 'object') return '(no config)';
		const x = c as { kids?: unknown[]; calendar?: { id?: string } };
		return `${x.kids?.length ?? 0} kids · cal id ${x.calendar?.id ? 'set' : 'NOT SET'}`;
	}

	function summarizeTickTickAll(p: unknown): string {
		if (Array.isArray(p)) {
			return `${p.length} total · ${p.map((x: { name: string }) => x.name).join(', ')}`;
		}
		if (p && typeof p === 'object' && 'error' in p) return `error: ${String(p.error)}`;
		return '(no data)';
	}

	function summarizeTickTickFamily(l: unknown): string {
		if (Array.isArray(l)) {
			if (l.length === 0) return '(no lists configured — set ticktick.lists in chota.config.ts)';
			return l
				.map((x: { internal: string; external: string; project: unknown; tasks: unknown[] }) =>
					x.project ? `${x.internal}(${x.tasks.length})` : `${x.internal}=NOT FOUND`
				)
				.join(' · ');
		}
		if (l && typeof l === 'object' && 'error' in l) return `error: ${String(l.error)}`;
		return '(no data)';
	}

	const sections: { title: string; summary: string; data: unknown }[] = $derived([
		{ title: 'Weather', summary: summarizeWeather(data.weather), data: data.weather },
		{ title: 'Bus trips', summary: summarizeTrips(data.trips), data: data.trips },
		{ title: "Today's chores", summary: summarizeChores(data.chores), data: data.chores },
		{ title: 'Calendar (week)', summary: summarizeCalendar(data.calendar), data: data.calendar },
		{
			title: 'Calendar list (paste id into chota.config.ts)',
			summary: summarizeCalendarList(data.calendarList),
			data: data.calendarList
		},
		{
			title: 'TickTick — family lists',
			summary: summarizeTickTickFamily(data.ticktickLists),
			data: data.ticktickLists
		},
		{
			title: 'TickTick — all projects (raw, for picking groupId)',
			summary: summarizeTickTickAll(data.ticktickAll),
			data: data.ticktickAll
		},
		{ title: 'Current quote', summary: summarizeQuote(data.quote), data: data.quote },
		{ title: 'Config (chota.config.ts)', summary: summarizeConfig(data.config), data: data.config }
	]);
</script>

<svelte:head><title>Chota — Admin</title></svelte:head>

<div class="mx-auto min-h-screen max-w-5xl space-y-6 bg-slate-100 p-6 dark:bg-neutral-950">
	<header>
		<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Admin</h1>
		<p class="text-sm text-slate-500 dark:text-neutral-500">Raw debug view. No auth gate yet.</p>
	</header>

	<!-- Google account connection -->
	<section
		class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Google account
		</h2>

		{#if $session.isPending}
			<p class="mt-2 text-sm text-slate-500 dark:text-neutral-500">Loading session…</p>
		{:else if $session.data}
			<div class="mt-3 flex items-center gap-4">
				{#if $session.data.user.image}
					<img
						src={$session.data.user.image}
						alt={$session.data.user.name}
						class="h-12 w-12 rounded-full ring-1 ring-slate-200 dark:ring-neutral-700"
						referrerpolicy="no-referrer"
					/>
				{/if}
				<div class="flex-1">
					<p class="text-sm font-medium text-slate-700 dark:text-neutral-200">
						{$session.data.user.name}
					</p>
					<p class="text-xs text-slate-500 dark:text-neutral-500">
						{$session.data.user.email}
					</p>
				</div>
				<button
					type="button"
					onclick={signOut}
					class="rounded-md bg-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
				>
					Sign out
				</button>
			</div>
		{:else}
			<p class="mt-2 text-sm text-slate-600 dark:text-neutral-400">
				Not connected. Sign in to grant calendar read access.
			</p>
			<button
				type="button"
				onclick={signInGoogle}
				class="mt-3 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
			>
				Sign in with Google
			</button>
		{/if}
	</section>

	<section
		class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Server now
		</h2>
		<p class="mt-2 font-mono text-sm text-slate-800 dark:text-neutral-200">{data.now}</p>
	</section>

	<section
		class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			TickTick health
		</h2>
		<div class="mt-3 flex items-center gap-3">
			<button
				type="button"
				onclick={pingTickTick}
				disabled={pinging}
				class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
			>
				{pinging ? 'Pinging…' : 'Ping MCP (list_projects)'}
			</button>
			{#if pingSummary}
				<span class="font-mono text-xs text-slate-600 dark:text-neutral-400">{pingSummary}</span>
			{/if}
		</div>
		{#if pingJson}
			<details class="mt-2">
				<summary class="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300">
					raw JSON ▸
				</summary>
				<pre class="mt-2 overflow-auto rounded bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{pingJson}</pre>
			</details>
		{/if}
	</section>

	<section
		class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Print
		</h2>

		<div class="mt-3 flex flex-wrap gap-2">
			{#snippet pbtn(text: string, kind: 'morning' | 'test', label: string, query: string)}
				<button
					type="button"
					onclick={() => fireRealPrint(kind, label, query)}
					disabled={printing !== null}
					class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
				>
					{printing === label ? 'Printing...' : text}
				</button>
			{/snippet}
			{@render pbtn('Print test (rulers)', 'test', 'test', '')}
			{@render pbtn('Print morning (text A)', 'morning', 'morning-a', '')}
			{@render pbtn('Print morning (text B)', 'morning', 'morning-b', '?font=b')}
			{@render pbtn('Print morning (text mixed)', 'morning', 'morning-mix', '?mix=1')}
			{@render pbtn('Print morning (image)', 'morning', 'morning-img', '?mode=image')}
		</div>

		{#if printResult}
			<p class="mt-2 font-mono text-xs text-slate-600 dark:text-neutral-400">{printResult}</p>
		{/if}

		<div class="mt-3 space-y-1 text-sm text-slate-700 dark:text-neutral-300">
			<p>
				<a class="text-blue-600 underline dark:text-blue-400" href={resolve('/admin/print')}
					>/admin/print</a
				>
				— text + rendered image side by side.
			</p>
			<p>
				<a
					class="text-blue-600 underline dark:text-blue-400"
					href={resolve('/api/print/[kind]', { kind: 'morning' })}
					target="_blank"
					rel="noopener">/api/print/morning</a
				>
				— plain-text preview (no print).
			</p>
			<p>
				<a
					class="text-blue-600 underline dark:text-blue-400"
					href="{resolve('/api/print/[kind]', { kind: 'morning' })}?format=png"
					target="_blank"
					rel="noopener">/api/print/morning?format=png</a
				>
				— rendered image preview (the production "designed print" path).
			</p>
			<p>
				<a class="text-blue-600 underline dark:text-blue-400" href={resolve('/admin/jobs')}
					>/admin/jobs</a
				>
				— scheduler status + per-job last runs.
			</p>
		</div>
	</section>

	<!-- Each section: summary on top, raw JSON collapsible. -->
	{#each sections as s (s.title)}
		<section
			class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
		>
			<h2
				class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500"
			>
				{s.title}
			</h2>
			<p class="mt-2 font-mono text-sm text-slate-700 dark:text-neutral-300">{s.summary}</p>
			<details class="mt-3 group">
				<summary
					class="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
				>
					raw JSON ▸
				</summary>
				<pre
					class="mt-2 overflow-auto rounded bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{JSON.stringify(s.data, null, 2)}</pre>
			</details>
		</section>
	{/each}
</div>
