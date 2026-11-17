<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';

	let { block }: { block: Extract<Block, { type: 'list' }> } = $props();
</script>

{#if block.title}<h2 class="label mb-5">{block.title}</h2>{/if}
<ul class="divide-y divide-white/[0.05]">
	{#each block.items as item, i (i)}
		<li
			data-item
			data-item-id={item.id}
			class="flex items-baseline gap-6 py-[0.9rem] {item.done
				? 'text-neutral-600 line-through decoration-neutral-700'
				: 'text-neutral-200'}"
		>
			<div class="min-w-0 flex-1">
				<div class="line-clamp-2 text-[2.2rem] leading-snug">{item.text}</div>
				{#if item.detail}<div class="truncate text-[1.5rem] text-neutral-500">
						{item.detail}
					</div>{/if}
			</div>
			{#if item.meta}<span class="shrink-0 text-[1.8rem] text-neutral-400 tabular-nums"
					>{item.meta}</span
				>{/if}
		</li>
	{/each}
</ul>
