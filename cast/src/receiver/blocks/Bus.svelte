<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { at, minutesFrom, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'bus' }> } = $props();

	// Departures still to come, counted down live; a route with none left is hidden.
	const routes = $derived(
		block.routes
			.map((r) => ({
				...r,
				next: r.departures.filter((d) => at(d.at) > view.now).sort((a, b) => at(a.at) - at(b.at))
			}))
			.filter((r) => r.next.length > 0)
	);
	const mins = (iso: string) => {
		const m = minutesFrom(at(iso));
		return m === 0 ? 'Due' : `${m} min`;
	};
</script>

{#if block.title}<h2 class="label mb-5">{block.title}</h2>{/if}
{#if routes.length === 0}
	<p class="text-[2rem] text-neutral-500">No buses due</p>
{:else}
	<ul class="space-y-[1.6rem]">
		{#each routes as r, i (i)}
			{@const [first, ...later] = r.next}
			<li class="flex items-center gap-6">
				<span
					class="w-[7.5rem] shrink-0 rounded-[0.6rem] bg-white/[0.08] py-1 text-center text-[2.2rem] font-semibold text-neutral-200"
					>{r.route}</span
				>
				<div class="min-w-0 flex-1">
					<div class="truncate text-[1.7rem] text-neutral-400">{r.to ?? ''}</div>
					<div class="text-[1.4rem] text-neutral-500 tabular-nums">
						{#if later.length}then {later
								.slice(0, 3)
								.map((d) => mins(d.at))
								.join(', ')}{/if}
					</div>
				</div>
				<div class="shrink-0 text-right tabular-nums">
					<div
						class="text-[3rem] leading-none {first.cancelled
							? 'text-neutral-600 line-through'
							: 'text-neutral-200'}"
					>
						{mins(first.at)}
					</div>
					<div class="mt-1 text-[1.3rem] text-neutral-500">
						{time(at(first.at))}{first.cancelled
							? ' · cancelled'
							: !first.realtime
								? ' · timetable'
								: ''}
					</div>
				</div>
			</li>
		{/each}
	</ul>
{/if}
