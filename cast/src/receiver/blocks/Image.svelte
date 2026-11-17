<script lang="ts">
	import { isImageUrl, type Block } from '../../protocol/schema.ts';

	let { block }: { block: Extract<Block, { type: 'image' }> } = $props();
	// The schema already allows only these; checked again here so nothing else ever reaches an <img>.
	const safe = $derived(isImageUrl(block.src));
</script>

<figure class="flex h-full flex-col">
	{#if safe}
		<img
			src={block.src}
			alt={block.alt ?? ''}
			class="min-h-0 w-full flex-1 rounded-[0.8rem] {block.fit === 'cover'
				? 'object-cover'
				: 'object-contain'} opacity-90"
		/>
	{/if}
	{#if block.caption}<figcaption class="mt-4 text-[1.7rem] text-neutral-400">
			{block.caption}
		</figcaption>{/if}
</figure>
