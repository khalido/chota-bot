<!--
  Upcoming departures, one line per route: "501 · Town · 6 min, 18 min". Minutes count down on the TV; a new minute
  slides in from above.
-->
<script lang="ts">
	import { fly } from 'svelte/transition';
	import type { Block } from '../../protocol/schema.ts';
	import { at, minutesFrom, view } from '../view.svelte.ts';

	let { block }: { block: Extract<Block, { type: 'bus' }> } = $props();
	/** Between departures; an expression, since Svelte trims a bare trailing space. */
	const SEP = ', ';

	// Departures still to come; a route with none left is hidden.
	const routes = $derived(
		block.routes
			.map((r) => ({
				...r,
				next: r.departures
					.filter((d) => at(d.at) > view.now)
					.sort((a, b) => at(a.at) - at(b.at))
					.slice(0, 3)
			}))
			.filter((r) => r.next.length > 0)
	);
	const mins = (iso: string) => {
		const m = minutesFrom(at(iso));
		return m === 0 ? 'Due' : `${m} min`;
	};
</script>

<h2 class="label mb-6">{block.title ?? 'Buses'}</h2>
{#if routes.length === 0}
	<p class="text-[2rem] text-neutral-500">No buses due</p>
{:else}
	<ul class="space-y-[1.5rem]">
		{#each routes as r, i (i)}
			<li data-item class="flex items-baseline gap-5">
				<span
					class="min-w-[5.5rem] rounded-[0.5rem] border border-white/15 px-3 text-center text-[2.2rem] font-semibold text-neutral-200"
					>{r.route}</span
				>
				<div class="min-w-0 flex-1">
					<div class="text-[2.4rem] text-neutral-100 tabular-nums">
						{#each r.next as d, j (j)}{#if j > 0}<span class="text-neutral-500">{SEP}</span
								>{/if}<span
								class={d.cancelled
									? 'text-neutral-600 line-through'
									: j === 0
										? 'text-neutral-100'
										: 'text-neutral-400'}
								>{#key mins(d.at)}<span class="inline-block" in:fly={{ y: -14, duration: 900 }}
										>{mins(d.at)}</span
									>{/key}</span
							>{/each}
					</div>
					{#if r.to}<div class="truncate text-[1.5rem] text-neutral-500">{r.to}</div>{/if}
				</div>
			</li>
		{/each}
	</ul>
{/if}
