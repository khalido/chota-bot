<script lang="ts">
	import type { CalendarEvent } from '$lib/server/tools/calendar';
	import { sydneyTimeCompact, sydneyYMD, sydneyDayOfWeek } from '$lib/time';

	type EventWithPeople = CalendarEvent & { people: string[] };

	let { events }: { events: EventWithPeople[] } = $props();

	const todayKey = sydneyYMD(new Date());
	const tomorrowKey = sydneyYMD(new Date(Date.now() + 24 * 60 * 60 * 1000));

	function dayLabel(dateKey: string, sample: Date): string {
		if (dateKey === todayKey) return 'Today';
		if (dateKey === tomorrowKey) return 'Tomorrow';
		return sydneyDayOfWeek(sample);
	}

	// Group events by Sydney calendar date, preserving sort order.
	const groups = $derived.by(() => {
		const m = new Map<string, EventWithPeople[]>();
		for (const e of events) {
			const key = sydneyYMD(e.start);
			if (!m.has(key)) m.set(key, []);
			m.get(key)!.push(e);
		}
		return Array.from(m, ([key, list]) => ({
			key,
			label: dayLabel(key, list[0].start),
			events: list
		}));
	});
</script>

<section
	class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
>
	<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
		Calendar
	</h2>

	{#if events.length === 0}
		<p class="mt-3 text-sm text-slate-400 italic dark:text-neutral-500">
			Nothing on the calendar.
		</p>
	{:else}
		<div class="mt-3 space-y-3">
			{#each groups as g (g.key)}
				<div>
					<div
						class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase dark:text-neutral-600"
					>
						{g.label}
					</div>
					<ul class="mt-1 space-y-1">
						{#each g.events as e (e.id)}
							<li class="flex items-baseline gap-2 text-sm">
								<span
									class="w-14 shrink-0 font-mono text-xs text-slate-500 dark:text-neutral-500"
								>
									{e.isAllDay ? 'all day' : sydneyTimeCompact(e.start)}
								</span>
								<span class="flex-1 text-slate-700 dark:text-neutral-200">{e.summary}</span>
								{#each e.people as p (p)}
									<span
										class="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-neutral-800 dark:text-neutral-300"
										>{p}</span
									>
								{/each}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	{/if}
</section>
