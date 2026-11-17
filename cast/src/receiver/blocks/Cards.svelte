<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';

	let { block }: { block: Extract<Block, { type: 'cards' }> } = $props();
</script>

<div class="flex h-full flex-col">
	{#if block.title}<h2 class="label mb-6">{block.title}</h2>{/if}
	<div
		class="grid min-h-0 flex-1 grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] content-start gap-7"
	>
		{#each block.items as card, i (i)}
			<article
				data-item
				data-item-id={card.id}
				class="flex min-h-0 flex-col overflow-hidden rounded-[1rem] border border-white/[0.07]"
			>
				{#if card.image}<img
						src={card.image}
						alt=""
						class="aspect-video w-full shrink-0 object-cover opacity-85"
					/>{/if}
				<div class="flex min-h-0 flex-col p-6">
					<div class="flex items-baseline justify-between gap-4">
						<h3 class="truncate text-[2rem] text-neutral-200">{card.title}</h3>
						{#if card.meta}<span class="shrink-0 text-[1.6rem] text-accent tabular-nums"
								>{card.meta}</span
							>{/if}
					</div>
					{#if card.body}<p class="mt-2 line-clamp-3 text-[1.55rem] leading-snug text-neutral-400">
							{card.body}
						</p>{/if}
				</div>
			</article>
		{/each}
	</div>
</div>
