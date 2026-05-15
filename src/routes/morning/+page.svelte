<script lang="ts">
	import BriefSheet from '$lib/components/print/BriefSheet.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Chota — Morning</title>
	<style>
		html,
		body {
			margin: 0;
			background: #fff;
		}
	</style>
</svelte:head>

<BriefSheet date={data.date} sections={data.sections} closing={data.closing} />
