<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { hourOf, longDate, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'clock' }> } = $props();

	const greeting = $derived.by(() => {
		const h = hourOf(view.now, block.timezone);
		return h < 5
			? 'Good night'
			: h < 12
				? 'Good morning'
				: h < 17
					? 'Good afternoon'
					: 'Good evening';
	});
</script>

<!-- Sized to its cell (container units), so a narrow column still fits the time on one line. -->
<div class="[container-type:inline-size] flex h-full flex-col justify-center">
	{#if block.greeting !== false}
		<div class="font-display text-[min(2.6rem,11cqi)] font-light text-neutral-400 italic">
			{greeting}
		</div>
	{/if}
	<div
		class="font-num mt-2 text-[min(12.5rem,42cqi)] leading-none font-light tracking-tight whitespace-nowrap text-neutral-200 tabular-nums"
	>
		{time(view.now, block.timezone)}
	</div>
	{#if block.date !== false}
		<div class="mt-5 text-[min(2.3rem,9cqi)] text-neutral-400">
			{longDate(view.now, block.timezone)}
		</div>
	{/if}
</div>
