<!--
  Now and the next hours. The condition sets a mood: its words coloured (warm sun, cool rain) and a slow layer behind
  (Sky). Temperatures ease to a new value instead of jumping.
-->
<script lang="ts">
	import { Spring } from 'svelte/motion';
	import type { Block } from '../../protocol/schema.ts';
	import { at, hour, hourOf, view } from '../view.svelte.ts';
	import Sky from './Sky.svelte';
	import { SKY_TEXT, skyOf } from './sky.ts';

	let { block }: { block: Extract<Block, { type: 'weather' }> } = $props();
	const deg = (c: number) => `${Math.round(c)}°`;
	const hours = $derived((block.hours ?? []).filter((h) => at(h.at) > view.now).slice(0, 8));
	const sky = $derived(block.now.sky ?? skyOf(block.now.condition, hourOf(view.now)));
	/** Long words ("Thunderstorm") shrink rather than break: wrap only between words. */
	const longest = $derived(Math.max(...block.now.condition.split(/\s+/).map((w) => w.length)));
	const condSize = $derived(
		longest > 10 ? 'text-[1.8rem]' : longest > 8 ? 'text-[2.1rem]' : 'text-[2.4rem]'
	);
	const temp = Spring.of(() => block.now.tempC, { stiffness: 0.04, damping: 0.7 });
</script>

<div class="relative isolate flex h-full flex-col">
	<Sky {sky} />
	<h2 class="label">{block.place ?? 'Weather'}</h2>
	<div class="mt-4 flex items-baseline gap-8">
		<span class="text-[6.5rem] leading-none font-extralight text-neutral-200 tabular-nums"
			>{deg(temp.current)}</span
		>
		<div class="min-w-0">
			<div
				class="{condSize} leading-tight [overflow-wrap:normal] [word-break:keep-all] {SKY_TEXT[
					sky
				]}"
			>
				{block.now.condition}
			</div>
			{#if block.now.feelsLikeC !== undefined}<div class="text-[1.7rem] text-neutral-500">
					Feels {deg(block.now.feelsLikeC)}
				</div>{/if}
		</div>
	</div>
	{#if block.now.note}<div class="mt-4 text-[1.7rem] text-neutral-400">{block.now.note}</div>{/if}
	{#if hours.length}
		<ol class="mt-6 flex justify-between gap-4 tabular-nums">
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
