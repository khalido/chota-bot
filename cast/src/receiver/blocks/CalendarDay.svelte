<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import { at, time, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'calendar-day' }> } = $props();

	// All-day first, then by start. An event is past once it ends (or, with no end, an hour after it starts).
	const events = $derived(
		[...block.events]
			.sort((a, b) => (a.start ? at(a.start) : 0) - (b.start ? at(b.start) : 0))
			.map((e) => {
				const start = e.start ? at(e.start) : undefined;
				const end = e.end ? at(e.end) : start !== undefined ? start + 3_600_000 : undefined;
				return {
					...e,
					startMs: start,
					past: end !== undefined && end <= view.now,
					now: start !== undefined && start <= view.now && end! > view.now
				};
			})
	);
</script>

{#if block.title}<h2 class="label mb-5">{block.title}</h2>{/if}
{#if events.length === 0}
	<p class="text-[2rem] text-neutral-500">Nothing on</p>
{:else}
	<ul class="space-y-[1.1rem]">
		{#each events as e, i (i)}
			<li
				class="flex items-baseline gap-6 border-l-[0.3rem] pl-5 {e.now
					? 'border-accent'
					: 'border-transparent'} {e.past ? 'opacity-40' : ''}"
			>
				<span class="w-[8.5rem] shrink-0 text-[1.8rem] text-neutral-400 tabular-nums"
					>{e.startMs === undefined ? 'All day' : time(e.startMs)}</span
				>
				<div class="min-w-0">
					<div class="truncate text-[2.2rem] text-neutral-200">{e.title}</div>
					{#if e.where || e.who}<div class="truncate text-[1.5rem] text-neutral-500">
							{[e.where, e.who].filter(Boolean).join(' · ')}
						</div>{/if}
				</div>
				{#if e.now}<span
						class="ml-auto shrink-0 text-[1.4rem] tracking-widest text-accent uppercase">Now</span
					>{/if}
			</li>
		{/each}
	</ul>
{/if}
