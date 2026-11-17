<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';

	let { block }: { block: Extract<Block, { type: 'stat' }> } = $props();
	const TONE = {
		good: 'text-emerald-300/80',
		bad: 'text-rose-300/80',
		neutral: 'text-neutral-400'
	};
</script>

<div class="flex h-full flex-col justify-center">
	<div class="label">{block.label}</div>
	<div class="mt-4 flex items-baseline gap-3">
		<span class="text-[6.5rem] leading-none font-light text-neutral-200 tabular-nums"
			>{block.value}</span
		>
		{#if block.unit}<span class="text-[2.4rem] text-neutral-400">{block.unit}</span>{/if}
	</div>
	{#if block.delta}<div class="mt-5 text-[1.9rem] {TONE[block.tone ?? 'neutral']}">
			{block.delta}
		</div>{/if}
	{#if block.note}<div class="mt-3 text-[1.6rem] text-neutral-500">{block.note}</div>{/if}
</div>
