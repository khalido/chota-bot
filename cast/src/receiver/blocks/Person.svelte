<!--
  One person's day, in their colour (theme.people): name, school or work hours with a bar through the day, a nudge,
  dates coming up with a countdown, today's events (a finished one fades and the rest glide up: animate:flip), and
  chores.
-->
<script lang="ts">
	import { flip } from 'svelte/animate';
	import { cubicOut } from 'svelte/easing';
	import { Tween } from 'svelte/motion';
	import { fade } from 'svelte/transition';
	import type { Block } from '../../protocol/schema.ts';
	import { at, colourOf, isoDay, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'person' }> } = $props();
	const colour = $derived(colourOf(block.name) ?? 'var(--accent)');

	const hours = $derived(block.hours && { start: at(block.hours.start), end: at(block.hours.end) });
	const through = Tween.of(
		() =>
			hours ? Math.min(1, Math.max(0, (view.now - hours.start) / (hours.end - hours.start))) : 0,
		{ duration: 1000, easing: cubicOut }
	);

	const DAY = 86_400_000;
	const today = $derived(Date.parse(isoDay(view.now)));
	const dates = $derived(
		(block.dates ?? [])
			.map((d) => ({ ...d, ms: Date.parse(d.date) }))
			.filter((d) => d.ms >= today)
			.slice(0, 2)
	);
	const away = (ms: number) => {
		const n = Math.round((ms - today) / DAY);
		return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `${n} days`;
	};
	const dayName = (ms: number) =>
		new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(ms);

	const events = $derived(
		(block.events ?? [])
			.map((e, i) => ({ ...e, key: e.id ?? `${i}`, s: e.start ? at(e.start) : 0 }))
			.filter((e) => (e.end ? at(e.end) : e.s + 60 * 60_000) > view.now)
			.sort((a, b) => a.s - b.s)
	);
	/** A full column fits: at most 3 events (then "+N more"), 2 dates, and two lines of chores, undone first. */
	const shown = $derived(events.slice(0, 3));
	const chores = $derived(
		[...(block.chores ?? [])].sort((a, b) => Number(!!a.done) - Number(!!b.done))
	);
</script>

<div class="relative flex h-full flex-col" style:--who={colour}>
	<!-- Their colour as a thin band down the cell's left edge: the column reads as theirs, the OLED stays black. -->
	<div
		class="pointer-events-none absolute top-[-2.2rem] bottom-[-2.2rem] left-[-2.2rem] w-[0.45rem] opacity-80"
		style:background="var(--who)"
	></div>
	<div class="flex items-baseline justify-between gap-6">
		<h2 class="text-[3.2rem] leading-none font-medium" style:color="var(--who)">{block.name}</h2>
		{#if block.hours?.label || hours}
			<span class="font-num text-[2.4rem] text-neutral-300 tabular-nums">
				{block.hours?.label ?? 'School'}
				{#if hours}{time(hours.start)}–{time(hours.end)}{/if}
			</span>
		{/if}
	</div>
	{#if hours}
		<div class="mt-4 h-[0.4rem] overflow-hidden rounded-full bg-white/[0.07]">
			<div
				class="h-full origin-left rounded-full opacity-70"
				style:background="var(--who)"
				style:transform="scaleX({through.current})"
			></div>
		</div>
	{/if}

	<div class="mt-4 grid min-h-0 flex-1 grid-cols-[1.15fr_1fr] gap-x-10">
		<div class="min-w-0">
			{#if events.length}
				<ul class="flex flex-col gap-1">
					{#each shown as e (e.key)}
						<li
							class="flex items-baseline gap-5 py-1"
							data-item
							data-item-id={e.id}
							animate:flip={{ duration: 900, easing: cubicOut }}
							out:fade={{ duration: 700 }}
						>
							<span class="font-num w-[6rem] shrink-0 text-[2.6rem] text-neutral-300 tabular-nums"
								>{e.start ? time(e.s) : 'All day'}</span
							>
							<div class="min-w-0">
								<div class="line-clamp-2 text-[2.1rem] leading-tight text-neutral-100">
									{e.title}
								</div>
								{#if e.where}<div class="truncate text-[1.5rem] text-neutral-500">
										{e.where}
									</div>{/if}
							</div>
						</li>
					{/each}
				</ul>
				{#if events.length > shown.length}
					<div class="pl-[7.25rem] text-[1.6rem] text-neutral-400">
						+{events.length - shown.length} more
					</div>
				{/if}
			{/if}
		</div>
		<div class="flex min-w-0 flex-col">
			{#if block.nudge}
				<div
					class="line-clamp-2 rounded-[0.8rem] border-l-[0.4rem] bg-white/[0.04] px-5 py-2 text-[2rem] leading-snug text-neutral-100"
					style:border-color="var(--who)"
				>
					{block.nudge}
				</div>
			{/if}

			{#if dates.length}
				<ul class="mt-4 flex flex-col gap-3">
					{#each dates as d (d.date + d.title)}
						<li data-item>
							<div class="text-[1.5rem] text-neutral-400">
								{dayName(d.ms)} · <span style:color="var(--who)">{away(d.ms)}</span>
							</div>
							<div class="truncate text-[1.9rem] leading-tight text-neutral-200">{d.title}</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if chores.length}
				<ul class="mt-auto flex max-h-[5.4rem] flex-wrap gap-x-7 overflow-hidden pt-3">
					{#each chores as c, i (i)}
						<li
							class="flex items-center gap-3 text-[1.8rem] leading-[2.4rem] whitespace-nowrap {c.done
								? 'text-neutral-600 line-through'
								: 'text-neutral-200'}"
							data-item
						>
							<span
								class="inline-block size-[1.3rem] rounded-full border-[0.18rem]"
								style:border-color="var(--who)"
								style:background={c.done ? 'var(--who)' : 'transparent'}
							></span>
							{c.text}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
