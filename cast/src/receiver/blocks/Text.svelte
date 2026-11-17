<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { markdown, type Span } from '../markdown.ts';

	let { block }: { block: Extract<Block, { type: 'text' }> } = $props();
	const paras = $derived(markdown(block.text));
</script>

{#snippet line(spans: Span[])}
	{#each spans as s, i (i)}
		{#if s.kind === 'bold'}<strong class="font-semibold text-neutral-100">{s.text}</strong>
		{:else if s.kind === 'italic'}<em>{s.text}</em>
		{:else if s.kind === 'code'}<code class="rounded bg-white/[0.07] px-2 font-mono text-[0.9em]"
				>{s.text}</code
			>
		{:else}{s.text}{/if}
	{/each}
{/snippet}

{#if block.title}<h2 class="label mb-6">{block.title}</h2>{/if}
<div class="max-w-[60rem] space-y-6 text-[2rem] leading-normal text-neutral-300">
	{#each paras as p, i (i)}
		{#if p.kind === 'heading'}<h3 class="text-[3rem] leading-tight font-light text-neutral-200">
				{@render line(p.spans)}
			</h3>
		{:else if p.kind === 'para'}<p>{@render line(p.spans)}</p>
		{:else if p.kind === 'bullets'}
			<ul class="space-y-2">
				{#each p.items as item, j (j)}<li class="flex gap-4">
						<span class="text-accent">•</span><span>{@render line(item)}</span>
					</li>{/each}
			</ul>
		{/if}
	{/each}
</div>
