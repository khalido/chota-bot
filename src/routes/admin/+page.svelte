<script lang="ts">
	import { resolve } from '$app/paths';
	import { version } from '$app/environment';
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
	// Which family member the print buttons + debug links target.
	// svelte-ignore state_referenced_locally
	let printWho = $state(data.recipients[0] ?? '');

	let pinging = $state(false);
	let pingSummary = $state<string | null>(null);
	let pingJson = $state<string | null>(null);
	async function pingTickTick() {
		pinging = true;
		pingSummary = null;
		pingJson = null;
		try {
			const r = await (await fetch('/api/ticktick/ping')).json();
			pingSummary = r.ok
				? `✓ ${r.ms}ms · ${r.projects} projects`
				: `✗ ${r.ms}ms · ${r.error ?? 'failed'}`;
			pingJson = JSON.stringify(r, null, 2);
		} catch (e) {
			pingSummary = `✗ ${e instanceof Error ? e.message : String(e)}`;
		} finally {
			pinging = false;
		}
	}

	// label is just for the busy-state UI; query is appended to the POST URL.
	async function fireRealPrint(kind: string, label: string, query = '') {
		printing = label;
		printResult = null;
		try {
			const res = await fetch(`/api/print/${kind}${query}`, { method: 'POST' });
			const body = await res.json();
			const meta =
				body.lines != null ? `${body.lines} lines, ${body.bytes} bytes` : `${body.bytes} bytes`;
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

	<!-- Compact info bar: build version + server time left, Google account right. -->
	<section
		class="rounded-xl bg-white px-5 py-3 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div class="font-mono text-xs text-slate-500 dark:text-neutral-500">
				<span title="package version + git commit">{version}</span>
				{#if data.deploy.state === 'up-to-date'}
					<span
						class="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
						>up to date</span
					>
				{:else if data.deploy.state === 'behind'}
					<span
						class="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
						title="origin/main is at {data.deploy.latest} — run npm run deploy"
						>{data.deploy.behind} commit{data.deploy.behind === 1 ? '' : 's'} behind</span
					>
				{:else if data.deploy.state === 'ahead'}
					<span
						class="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400"
						>ahead of main</span
					>
				{:else}
					<span
						class="ml-1.5 text-slate-400 dark:text-neutral-600"
						title="couldn't reach the git remote">version check failed</span
					>
				{/if}
				<span class="mx-1.5 text-slate-300 dark:text-neutral-700">·</span>
				<span>{data.now}</span>
			</div>

			{#if $session.isPending}
				<span class="text-xs text-slate-400 dark:text-neutral-600">session…</span>
			{:else if $session.data}
				<div class="flex items-center gap-2">
					{#if $session.data.user.image}
						<img
							src={$session.data.user.image}
							alt={$session.data.user.name}
							class="h-6 w-6 rounded-full ring-1 ring-slate-200 dark:ring-neutral-700"
							referrerpolicy="no-referrer"
						/>
					{/if}
					<span
						class="text-xs font-medium text-slate-600 dark:text-neutral-300"
						title={$session.data.user.email}>{$session.data.user.name}</span
					>
					<button
						type="button"
						onclick={signOut}
						class="text-xs text-slate-400 hover:text-slate-600 dark:text-neutral-600 dark:hover:text-neutral-300"
					>
						sign out
					</button>
				</div>
			{:else}
				<button
					type="button"
					onclick={signInGoogle}
					class="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
				>
					Sign in with Google
				</button>
			{/if}
		</div>
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
				<summary
					class="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
				>
					raw JSON ▸
				</summary>
				<pre
					class="mt-2 overflow-auto rounded bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{pingJson}</pre>
			</details>
		{/if}
	</section>

	<section
		class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Print
		</h2>

		<div class="mt-3 flex flex-wrap items-center gap-2">
			{#snippet pbtn(text: string, kind: string, label: string, query: string)}
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
			<select
				bind:value={printWho}
				class="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
			>
				{#each data.recipients as who (who)}
					<option value={who}>{who}</option>
				{/each}
			</select>
			{@render pbtn('text A', printWho, `${printWho}-a`, '')}
			{@render pbtn('text B', printWho, `${printWho}-b`, '?font=b')}
			{@render pbtn('text mixed', printWho, `${printWho}-mix`, '?mix=1')}
			{@render pbtn('image', printWho, `${printWho}-img`, '?mode=image')}
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
					href={resolve('/api/print/[kind]', { kind: printWho })}
					target="_blank"
					rel="noopener">/api/print/{printWho}</a
				>
				— plain-text preview of the selected person (no print).
			</p>
			<p>
				<a
					class="text-blue-600 underline dark:text-blue-400"
					href="{resolve('/api/print/[kind]', { kind: printWho })}?format=png"
					target="_blank"
					rel="noopener">/api/print/{printWho}?format=png</a
				>
				— rendered image preview (the production "designed print" path).
			</p>
			<p>
				<a class="text-blue-600 underline dark:text-blue-400" href={resolve('/admin/jobs')}
					>/admin/jobs</a
				>
				— scheduler status + per-job last runs.
			</p>
			<p>
				<a class="text-blue-600 underline dark:text-blue-400" href={resolve('/admin/agent')}
					>/admin/agent</a
				>
				— poke the ToolLoopAgent: tools registered, env health, per-step loop inspector.
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
			<details class="group mt-3">
				<summary
					class="cursor-pointer text-xs text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
				>
					raw JSON ▸
				</summary>
				<pre
					class="mt-2 overflow-auto rounded bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:bg-neutral-950 dark:text-neutral-200">{JSON.stringify(
						s.data,
						null,
						2
					)}</pre>
			</details>
		</section>
	{/each}
</div>
