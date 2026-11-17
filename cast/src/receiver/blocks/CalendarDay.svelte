<!--
  The day's calendar, built to be read from the sofa: all-day events on one line at the top, then each timed event
  with its start time large. The event on now and the next one are called out; finished ones dim.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Spring } from 'svelte/motion';
	import type { Block } from '../../protocol/schema.ts';
	import { at, minutesFrom, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'calendar-day' }> } = $props();

	const HOUR = 3_600_000;
	const allDay = $derived(block.events.filter((e) => !e.start));
	const timed = $derived.by(() => {
		const rows = block.events
			.filter((e) => e.start)
			.map((e) => {
				const start = at(e.start!);
				const end = e.end ? at(e.end) : start + HOUR;
				return { ...e, startMs: start, endMs: end };
			})
			.sort((a, b) => a.startMs - b.startMs);
		const nextAt = rows.findIndex((e) => e.startMs > view.now);
		return rows.map((e, i) => ({
			...e,
			past: e.endMs <= view.now,
			now: e.startMs <= view.now && e.endMs > view.now,
			next: i === nextAt
		}));
	});
	// One accent bar that glides to the event on now (or, dimmer, the next one) as the day moves on.
	let list: HTMLUListElement | undefined = $state();
	let mark = $state({ y: 0, h: 0, now: false, shown: false });
	$effect(() => {
		const i = timed.findIndex((e) => e.now);
		const at = i >= 0 ? i : timed.findIndex((e) => e.next);
		const el = list?.querySelectorAll('li')[at];
		// Hidden in place: the bar fades where it was rather than gliding to the top.
		mark = el
			? { y: el.offsetTop, h: el.offsetHeight, now: i >= 0, shown: true }
			: { ...untrack(() => mark), shown: false };
	});
	const barY = Spring.of(() => mark.y, { stiffness: 0.05, damping: 0.8 });
	const barH = Spring.of(() => mark.h, { stiffness: 0.05, damping: 0.8 });

	/** "in 40 min", "in 2 h 5 min". */
	const inTime = (ms: number) => {
		const m = minutesFrom(ms);
		return m < 60 ? `in ${m} min` : `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
	};
</script>

<div class="flex h-full flex-col">
	<h2 class="label">{block.title ?? 'Today'}</h2>
	{#if allDay.length}
		<div class="mt-5 flex flex-wrap items-baseline gap-x-5 gap-y-2 text-[2rem]">
			<span class="text-[1.4rem] tracking-wide text-neutral-500">All day</span>
			{#each allDay as e, i (i)}
				<span data-item data-item-id={e.id} class="text-neutral-200">{e.title}</span>
			{/each}
		</div>
	{/if}
	{#if timed.length === 0 && allDay.length === 0}
		<p class="mt-6 text-[2.2rem] text-neutral-500">Nothing on today</p>
	{:else}
		<ul class="relative mt-5 space-y-[1.1rem]" bind:this={list}>
			<div
				class="absolute top-0 left-0 w-[0.3rem] rounded-full bg-accent transition-opacity duration-1000"
				style:transform="translateY({barY.current}px)"
				style:height="{barH.current}px"
				style:opacity={mark.shown ? (mark.now ? 1 : 0.35) : 0}
			></div>
			{#each timed as e, i (i)}
				<li
					data-item
					data-item-id={e.id}
					class="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-6 pl-[1.6rem] transition-opacity duration-1000 {e.past
						? 'opacity-35'
						: ''}"
				>
					<span
						class="text-[2.6rem] leading-none font-light tabular-nums {e.now || e.next
							? 'text-accent'
							: 'text-neutral-300'}">{time(e.startMs)}</span
					>
					<div class="min-w-0">
						<div class="truncate text-[2.3rem] leading-tight text-neutral-100">{e.title}</div>
						{#if e.now || e.next || e.where || e.who}
							<div class="truncate text-[1.45rem] text-neutral-500">
								{#if e.now}<span class="text-accent">Now</span>{:else if e.next}<span
										class="text-accent">Next</span
									>{/if}
								{[
									e.now ? `until ${time(e.endMs)}` : e.next ? inTime(e.startMs) : '',
									e.where,
									e.who
								]
									.filter(Boolean)
									.join(' · ')}
							</div>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>
