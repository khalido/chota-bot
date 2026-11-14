<!--
  TV "Calendar": the week ahead, grouped by day, in two columns of big type.
-->
<script lang="ts">
	import { sydneyDateMedium, sydneyTimeCompact, sydneyYMD, sydneyYMDOffset } from '#lib/time.ts';
	import type { CalendarEvent } from '#lib/server/tools/calendar.ts';

	let { now, events }: { now: Date; events: CalendarEvent[] } = $props();

	// What fits two columns at 1080p. Beyond it, say how many are left out.
	const MAX_EVENTS = 12;

	const shown = $derived(events.slice(0, MAX_EVENTS));

	const groups = $derived.by(() => {
		const todayKey = sydneyYMD(now);
		const tomorrowKey = sydneyYMDOffset(1, now);
		// Built fresh each run and never mutated after, so a plain Map is fine.
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const m = new Map<string, CalendarEvent[]>();
		for (const e of shown) {
			const key = sydneyYMD(e.start);
			if (!m.has(key)) m.set(key, []);
			m.get(key)!.push(e);
		}
		return Array.from(m, ([key, list]) => ({
			key,
			label:
				key === todayKey
					? 'Today'
					: key === tomorrowKey
						? 'Tomorrow'
						: sydneyDateMedium(list[0].start),
			events: list
		}));
	});
</script>

{#if events.length === 0}
	<p class="text-[5vh] text-neutral-500">Nothing on the calendar this week</p>
{:else}
	<div class="columns-2 gap-[5vw]">
		{#each groups as g (g.key)}
			<section class="mb-[3vh] break-inside-avoid">
				<h2 class="text-[3vh] font-semibold tracking-widest text-amber-200/80 uppercase">
					{g.label}
				</h2>
				<ul class="mt-[1vh] space-y-[0.8vh]">
					{#each g.events as e (e.id)}
						<li class="flex items-baseline gap-[1.5vw] text-[3.8vh]">
							<span class="w-[8vw] shrink-0 text-[3vh] text-neutral-400 tabular-nums">
								{e.isAllDay ? 'All day' : sydneyTimeCompact(e.start)}
							</span>
							<span class="truncate text-neutral-200">{e.summary}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
		{#if events.length > MAX_EVENTS}
			<p class="text-[3vh] text-neutral-500">+{events.length - MAX_EVENTS} more this week</p>
		{/if}
	</div>
{/if}
