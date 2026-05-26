<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import BriefSheet from '$lib/components/print/BriefSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Re-run +page.server.ts.load() every minute so the rendered brief tracks
	// the latest cached tool data (weather / bus / calendar / chores). Safe
	// even when agent-browser is capturing this page for the printer: the
	// screenshot completes in well under a second, the interval can't fire
	// in that window.
	onMount(() => {
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
