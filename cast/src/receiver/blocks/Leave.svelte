<!--
  "Leave in 6 min", big, with a bar that fills as the time nears. The minutes ease down (Tween) rather than jump, and
  the colour warms from the accent to amber in the last three minutes. Nothing blinks.
-->
<script lang="ts">
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { Block } from '../../protocol/schema.ts';
	import { at, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'leave' }> } = $props();
	const leaveAt = $derived(at(block.at));
	const from = $derived(block.from ? at(block.from) : leaveAt - 30 * 60_000);
	const left = $derived(Math.ceil((leaveAt - view.now) / 60_000));
	const mins = Tween.of(() => Math.max(0, left), { duration: 900, easing: cubicOut });
	const done = Tween.of(() => Math.min(1, Math.max(0, (view.now - from) / (leaveAt - from))), {
		duration: 1000,
		easing: cubicOut
	});
	const urgent = $derived(left <= 3);
</script>

<div class="flex h-full flex-col">
	<h2 class="label">{block.label ?? 'Leave'}</h2>
	<div class="mt-3 flex items-baseline gap-4 {urgent ? 'text-amber-300' : 'text-neutral-100'}">
		{#if left > 0}
			<span class="text-[2.4rem] font-light">in</span>
			<span class="font-num text-[9.5rem] leading-none font-light tabular-nums"
				>{Math.round(mins.current)}</span
			>
			<span class="text-[2.4rem] font-light">min</span>
		{:else if left > -5}
			<span class="font-num text-[7rem] leading-none">Leave now</span>
		{:else}
			<span class="text-[3rem] leading-none font-light text-neutral-500">Gone</span>
		{/if}
	</div>
	<div class="mt-5 h-[0.5rem] overflow-hidden rounded-full bg-white/[0.08]">
		<div
			class="h-full origin-left rounded-full {urgent ? 'bg-amber-300/80' : 'bg-accent'}"
			style:transform="scaleX({done.current})"
		></div>
	</div>
	<div class="mt-3 truncate text-[1.6rem] text-neutral-400">
		{block.note ?? ''}{block.note ? ' · ' : ''}by {time(leaveAt)}
	</div>
</div>
