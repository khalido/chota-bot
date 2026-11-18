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
	const trace = $derived.by(() => {
		const t = (block.trace ?? []).map((p) => ({ ms: at(p.at), c: p.tempC }));
		if (t.length < 2) return [];
		const lo = Math.min(...t.map((p) => p.c));
		const hi = Math.max(...t.map((p) => p.c));
		const step = t[1].ms - t[0].ms;
		return t.map((p) => ({
			h: 0.2 + (0.8 * (p.c - lo)) / (hi - lo || 1),
			past: p.ms + step <= view.now,
			now: p.ms <= view.now && view.now < p.ms + step
		}));
	});
	const temp = Spring.of(() => block.now.tempC, { stiffness: 0.04, damping: 0.7 });
</script>

<div class="relative isolate flex h-full flex-col">
	<Sky {sky} />
	<h2 class="label">{block.place ?? 'Weather'}</h2>
	<div class="mt-4 flex items-baseline gap-8">
		<span class="font-num text-[7.2rem] leading-none font-light text-neutral-100 tabular-nums"
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
	{#if trace.length}
		<div class="mt-4 flex h-[3.2rem] items-end gap-[0.25rem]" aria-hidden="true">
			{#each trace as b, i (i)}
				<div
					class="flex-1 rounded-t-[0.15rem] {b.now
						? 'bg-accent/70'
						: b.past
							? 'bg-white/[0.07]'
							: 'bg-white/[0.16]'}"
					style:height="{b.h * 100}%"
				></div>
			{/each}
		</div>
	{/if}
	{#if block.now.note}<div class="mt-4 text-[1.7rem] text-neutral-400">{block.now.note}</div>{/if}
	{#if block.now.wear}<div class="mt-2 text-[1.9rem] text-neutral-200">{block.now.wear}</div>{/if}
	{#if hours.length}
		<ol class="font-num mt-6 flex justify-between gap-4 tabular-nums">
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
