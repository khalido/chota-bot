<!--
  /tv — chota's screen on the living-room TV, as a Google Cast Web Receiver
  (app ID in docs; registered unpublished, URL http://<Pi IP>/tv). Plan: the
  TV view of docs/chota-overview.html.

  One page, screens as tabs switched by the remote's left and right arrows; no
  page loads while it's on screen. Data reloads once a minute; after a deploy
  the page reloads itself so it never asks for files that are gone. Read-only:
  /tv is open to the home network and a remote has no "who is asking".

  Google's receiver SDK must be on the page for the Cast session to start, and
  the hidden <cast-media-player> is what makes remote keys arrive as keydown
  events on Google TV devices. Loaded, alive and key events are reported to
  /tv/probe so the Pi's log shows how the receiver behaves.
-->
<script lang="ts">
	import { version } from '$app/env';
	import { refreshAll } from '$app/navigation';
	import { SYDNEY_TZ } from '#lib/time.ts';
	import TodayScreen from '#lib/components/tv/TodayScreen.svelte';
	import WeekScreen from '#lib/components/tv/WeekScreen.svelte';
	import HomeScreen from '#lib/components/tv/HomeScreen.svelte';
	import DebugScreen from '#lib/components/tv/DebugScreen.svelte';
	import type { TvDebug } from '#lib/components/tv/types.ts';

	let { data } = $props();

	const TABS = ['Today', 'Calendar', 'Home', 'Debug'] as const;
	const REFRESH_MS = 60_000;

	let tab = $state(0);
	let now = $state(new Date());
	let started = $state(Date.now());
	let screen = $state('');
	let cast = $state('not started');
	let keys = $state<TvDebug['keys']>([]);
	let lastOk = $state(Date.now());
	let refreshError = $state('');

	const clock = (d: Date, seconds = false) =>
		d.toLocaleTimeString('en-AU', {
			timeZone: SYDNEY_TZ,
			hour: 'numeric',
			minute: '2-digit',
			second: seconds ? '2-digit' : undefined
		});

	function uptime(ms: number): string {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
	}

	// Stale when the last good refresh is more than two ticks old.
	const stale = $derived(now.getTime() - lastOk > 2 * REFRESH_MS + 5_000);

	const debug = $derived<TvDebug>({
		screen,
		uptime: uptime(now.getTime() - started),
		cast,
		version,
		lastRefresh: refreshError
			? `${refreshError} (last good ${clock(new Date(lastOk))})`
			: `ok at ${clock(new Date(lastOk), true)}`,
		keys
	});

	const report = (what: object) =>
		fetch('/tv/probe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(what)
		}).catch(() => {});

	// Once a minute: ask the server which build it runs (a static file, so it's
	// cheap). Server away (a deploy restarting it, Wi-Fi gone) → keep the last
	// data and try next minute, rather than let a failed reload put an error
	// page on the TV. New build → reload the page. Otherwise re-run the load.
	async function tick() {
		try {
			const res = await fetch('/_app/version.json', { cache: 'no-store' });
			if (!res.ok) throw new Error(`server answered ${res.status}`);
			const live = ((await res.json()) as { version: string }).version;
			if (live !== version) {
				report({ event: 'new build, reloading', from: version, to: live });
				location.reload();
				return;
			}
			await refreshAll();
			lastOk = Date.now();
			refreshError = '';
		} catch (err) {
			refreshError = err instanceof Error ? err.message : String(err);
		}
	}

	let keyId = 0;
	function onKey(e: KeyboardEvent) {
		keys = [{ id: keyId++, key: e.key, code: e.code, at: clock(new Date(), true) }, ...keys].slice(
			0,
			12
		);
		report({ event: 'key', key: e.key, code: e.code, keyCode: e.keyCode });
		if (e.key === 'ArrowRight') tab = (tab + 1) % TABS.length;
		else if (e.key === 'ArrowLeft') tab = (tab + TABS.length - 1) % TABS.length;
		// Keep Back from leaving the receiver.
		else if (e.key === 'BrowserBack' || e.key === 'GoBack') e.preventDefault();
	}

	$effect(() => {
		screen = `${innerWidth}×${innerHeight} at ×${devicePixelRatio} · ${navigator.userAgent}`;
		started = Date.now();
		report({ event: 'loaded', screen, version });

		const second = setInterval(() => (now = new Date()), 1000);
		const refresh = setInterval(tick, REFRESH_MS);
		// Every 5 minutes: still alive, for measuring how long the receiver stays up.
		const alive = setInterval(
			() => report({ event: 'alive', up: uptime(Date.now() - started) }),
			5 * 60_000
		);

		// The Cast receiver SDK only exists when the page runs on a Cast device.
		const startCast = () => {
			const c = (
				window as unknown as {
					cast?: {
						framework?: { CastReceiverContext: { getInstance(): { start(o?: object): void } } };
					};
				}
			).cast;
			if (!c?.framework) {
				cast = 'no Cast SDK (not on a Cast device?)';
				return;
			}
			try {
				c.framework.CastReceiverContext.getInstance().start({ disableIdleTimeout: true });
				cast = 'started';
				report({ event: 'cast started' });
			} catch (err) {
				cast = `failed: ${err}`;
				report({ event: 'cast failed', error: String(err) });
			}
		};
		const sdk = document.createElement('script');
		sdk.src = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
		sdk.onload = startCast;
		sdk.onerror = () => (cast = 'Cast SDK failed to load');
		document.head.append(sdk);

		return () => {
			clearInterval(second);
			clearInterval(refresh);
			clearInterval(alive);
			sdk.remove();
		};
	});
</script>

<svelte:head>
	<title>Chota TV</title>
</svelte:head>

<svelte:document onkeydown={onKey} />

<!-- Remote keys arrive only with a media element on the page. -->
<cast-media-player style="display:none"></cast-media-player>

<!-- Fixed dark colours, not dark: variants: the root layout switches the
     theme by the hour, and the TV stays dark all day. -->
<main
	class="flex h-screen flex-col overflow-hidden bg-neutral-950 px-[5vw] py-[5vh] font-sans text-neutral-200"
>
	<header class="flex items-baseline justify-between">
		<nav class="flex gap-[1vw]" aria-label="Screens">
			{#each TABS as label, i (label)}
				<span
					class={[
						'rounded-[1vh] border-b-[0.5vh] px-[1.5vw] py-[0.8vh] text-[3vh] font-medium',
						i === tab
							? 'border-amber-300 bg-neutral-800 text-neutral-100'
							: 'border-transparent text-neutral-500'
					]}
					aria-current={i === tab ? 'page' : undefined}>{label}</span
				>
			{/each}
		</nav>
		<div class="flex items-baseline gap-[2vw] text-[3vh] text-neutral-500 tabular-nums">
			{#if stale}
				<span class="text-amber-300/80">Offline since {clock(new Date(lastOk))}</span>
			{/if}
			{#if TABS[tab] !== 'Today'}
				<span class="text-neutral-400">{clock(now)}</span>
			{/if}
		</div>
	</header>

	<div class="mt-[5vh] min-h-0 flex-1">
		{#if TABS[tab] === 'Today'}
			<TodayScreen
				{now}
				weather={data.weather}
				headline={data.headline}
				events={data.events}
				trips={data.trips}
			/>
		{:else if TABS[tab] === 'Calendar'}
			<WeekScreen {now} events={data.events} />
		{:else if TABS[tab] === 'Home'}
			<HomeScreen home={data.home} />
		{:else}
			<DebugScreen {debug} />
		{/if}
	</div>
</main>
