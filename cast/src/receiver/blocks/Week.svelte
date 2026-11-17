<!-- Days side by side: today marked, past days and finished events dimmed, times above titles so names fit. -->
<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { at, isoDay, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'week' }> } = $props();

	const today = $derived(isoDay(view.now));
	/** "Tue 17" from "2026-11-17": a calendar date, so read and shown in UTC to keep the day as given. */
	const heading = (date: string) =>
		new Intl.DateTimeFormat(undefined, {
			weekday: 'short',
			day: 'numeric',
			timeZone: 'UTC'
		}).format(Date.parse(`${date}T00:00:00Z`));
	const sorted = (events: Extract<Block, { type: 'week' }>['days'][number]['events']) =>
		[...events].sort((a, b) => (a.start ? at(a.start) : 0) - (b.start ? at(b.start) : 0));
	const ended = (e: { start?: string; end?: string }) => {
		const end = e.end ? at(e.end) : e.start ? at(e.start) + 3_600_000 : undefined;
		return end !== undefined && end <= view.now;
	};
</script>

<div class="flex h-full flex-col">
	{#if block.title}<h2 class="label mb-5">{block.title}</h2>{/if}
	<div
		class="grid min-h-0 flex-1 gap-5"
		style:grid-template-columns="repeat({block.days.length}, minmax(0, 1fr))"
	>
		{#each block.days as d, i (i)}
			{@const isToday = d.date === today}
			<section
				class="flex min-h-0 flex-col border-t-[0.3rem] pt-4 {isToday
					? 'border-accent'
					: 'border-white/10'} {d.date < today ? 'opacity-40' : ''}"
			>
				<h3 class="text-[1.9rem] {isToday ? 'font-medium text-neutral-100' : 'text-neutral-400'}">
					{isToday ? 'Today' : heading(d.date)}
				</h3>
				{#if d.events.length === 0}
					<p class="mt-4 text-[1.6rem] text-neutral-600">Nothing on</p>
				{:else}
					<ul class="mt-4 space-y-5 overflow-hidden">
						{#each sorted(d.events) as e, j (j)}
							<li data-item data-item-id={e.id} class={ended(e) ? 'opacity-40' : ''}>
								<div class="text-[1.45rem] text-neutral-500 tabular-nums">
									{e.start ? time(at(e.start)) : 'All day'}
								</div>
								<div class="line-clamp-2 text-[1.9rem] leading-tight text-neutral-200">
									{e.title}
								</div>
								{#if e.where}<div class="truncate text-[1.3rem] text-neutral-500">
										{e.where}
									</div>{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>
</div>
