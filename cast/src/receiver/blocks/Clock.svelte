<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { longDate, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'clock' }> } = $props();
</script>

<div class="flex h-full flex-col justify-center">
	<div
		class="text-[9rem] leading-none font-extralight tracking-tight text-neutral-300 tabular-nums"
	>
		{time(view.now, block.timezone)}
	</div>
	{#if block.date !== false}
		<div class="mt-5 text-[2.4rem] font-light text-neutral-400">
			{longDate(view.now, block.timezone)}
		</div>
	{/if}
</div>
