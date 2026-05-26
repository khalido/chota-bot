<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import BriefSheet from '$lib/components/print/BriefSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Re-run +page.server.ts.load() every minute so the rendered brief tracks
	// the latest cached tool data (weather/bus/calendar/chores). Skipped when
	// `?bare=1` — that's the agent-browser screenshot mode at print time;
	// reloading the DOM mid-capture would be wasteful at best and a race at
	// worst.
	onMount(() => {
		if (page.url.searchParams.get('bare') === '1') return;
		const refresh = setInterval(() => invalidateAll(), 60_000);
		return () => clearInterval(refresh);
	});
</script>

<svelte:head>
	<title>Chota — {data.who}</title>
	<style>
		html,
		body {
			margin: 0;
			background: #fff;
		}
	</style>
</svelte:head>

<BriefSheet
	date={data.date}
	mark={data.mark}
	sections={data.sections}
	closing={data.closing}
	printedAt={data.printedAt}
/>
