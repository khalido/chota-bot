<script lang="ts">
	import Clock from '$lib/components/Clock.svelte';
	import Bus from '$lib/components/Bus.svelte';
	import Weather from '$lib/components/Weather.svelte';
	import Chores from '$lib/components/Chores.svelte';
	import Calendar from '$lib/components/Calendar.svelte';
	import Lists from '$lib/components/Lists.svelte';
	import FunQuote from '$lib/components/FunQuote.svelte';
	import PrintMorning from '$lib/components/PrintMorning.svelte';
	import { resolve } from '$app/paths';
	import { invalidateAll, goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Idle kiosk: with no interaction for this long, fall back to the ambient
	// clock view. Tapping the clock returns here (/clock is a link back to /).
	const IDLE_TO_CLOCK_MS = 3 * 60_000;

	onMount(() => {
		// Re-run +page.server.ts.load() every minute. Tools return cached data
		// (warmed by the *-refresh jobs), so this is cheap — keeps the dashboard
		// fresh without per-card polling.
		const refresh = setInterval(() => invalidateAll(), 60_000);

		// Reset an idle countdown on any interaction; on timeout, show the clock.
		let idle: ReturnType<typeof setTimeout>;
		const resetIdle = () => {
			clearTimeout(idle);
			idle = setTimeout(() => goto(resolve('/clock')), IDLE_TO_CLOCK_MS);
		};
		const activity = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
		for (const evt of activity) window.addEventListener(evt, resetIdle, { passive: true });
		resetIdle();

		return () => {
			clearInterval(refresh);
			clearTimeout(idle);
			for (const evt of activity) window.removeEventListener(evt, resetIdle);
		};
	});
</script>

<svelte:head><title>Chota</title></svelte:head>

<main class="min-h-screen bg-slate-100 p-6 dark:bg-neutral-950">
	<header class="mx-auto mb-6 max-w-5xl">
		<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Chota</h1>
		<p class="text-sm text-slate-500 dark:text-neutral-500">Family kiosk</p>
	</header>

	<div class="mx-auto grid max-w-5xl grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
		<a
			href={resolve('/clock')}
			class="rounded-2xl ring-slate-300 transition hover:ring-2 md:col-span-2 lg:col-span-3"
			aria-label="Open fullscreen clock"
		>
			<Clock quote={data.quote} />
		</a>

		<Bus trips={data.trips} />
		<a
			href={resolve('/weather')}
			class="rounded-2xl ring-slate-300 transition hover:ring-2 dark:ring-neutral-700"
			aria-label="Open weather details"
		>
			<Weather weather={data.weather} headline={data.headline} />
		</a>
		<Chores chores={data.chores} />
		<Calendar events={data.events} />
		<Lists lists={data.lists} />
		<FunQuote quote={data.funQuote} />

		<div class="md:col-span-2 lg:col-span-3">
			<PrintMorning recipients={data.recipients} />
		</div>
	</div>
</main>
