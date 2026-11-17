<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { at, hour, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'weather' }> } = $props();
	const deg = (c: number) => `${Math.round(c)}°`;
	const hours = $derived((block.hours ?? []).filter((h) => at(h.at) > view.now).slice(0, 8));
</script>

<div class="flex h-full flex-col">
	<h2 class="label">{block.place ?? 'Weather'}</h2>
	<div class="mt-4 flex items-baseline gap-8">
		<span class="text-[7.5rem] leading-none font-extralight text-neutral-200 tabular-nums"
			>{deg(block.now.tempC)}</span
		>
		<div>
			<div class="text-[2.4rem] text-neutral-300">{block.now.condition}</div>
			{#if block.now.feelsLikeC !== undefined}<div class="text-[1.7rem] text-neutral-500">
					Feels {deg(block.now.feelsLikeC)}
				</div>{/if}
		</div>
	</div>
	{#if block.now.note}<div class="mt-4 text-[1.7rem] text-neutral-400">{block.now.note}</div>{/if}
	{#if hours.length}
		<ol class="mt-auto flex justify-between gap-4 pt-6 tabular-nums">
			{#each hours as h, i (i)}
				<li class="flex flex-col items-center gap-1">
					<span class="text-[1.4rem] text-neutral-500">{hour(at(h.at))}</span>
					<span class="text-[2.3rem] text-neutral-200">{deg(h.tempC)}</span>
					{#if h.rainPct !== undefined}
						<span class="text-[1.35rem] {h.rainPct >= 50 ? 'text-sky-300/80' : 'text-neutral-600'}"
							>{Math.round(h.rainPct)}%</span
						>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</div>
