<script lang="ts">
	import Clock from '$lib/components/Clock.svelte';
	import { invalidateAll } from '$app/navigation';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Refresh quote + weather once a minute (the clock itself ticks client-side).
	$effect(() => {
		const id = setInterval(() => invalidateAll(), 60_000);
		return () => clearInterval(id);
	});
</script>

<svelte:head><title>Chota — Clock</title></svelte:head>

<!-- Whole page is a link back to /. Touchscreen-friendly: tap anywhere to return. -->
<a href={resolve('/')} class="block" aria-label="Back to dashboard">
	<Clock quote={data.quote} weather={data.weather} size="full" />
</a>
