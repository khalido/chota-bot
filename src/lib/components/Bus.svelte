<script lang="ts">
	import type { TripReport } from '$lib/server/print/brief';
	import { sydneyTimeCompact, sydneyTimeOnDay } from '$lib/time';

	let { trips }: { trips: TripReport[] } = $props();

	let now = $state(new Date());

	$effect(() => {
		const id = setInterval(() => (now = new Date()), 30_000);
		return () => clearInterval(id);
	});

	function minsFromNow(d: Date | string): number {
		const t = typeof d === 'string' ? new Date(d).getTime() : d.getTime();
		return Math.round((t - now.getTime()) / 60_000);
	}

	function asDate(d: Date | string): Date {
		return typeof d === 'string' ? new Date(d) : d;
	}

	/**
	 * Show a trip if NOW is between (target - 90 min) and (target + 15 min).
	 * Trips without a targetTime are always shown (catch-all). Per the
	 * fork-friendly principle: visibility logic lives in the component, not
	 * baked into the loader.
	 */
	function isRelevant(trip: TripReport['trip'], at: Date): boolean {
		if (!trip.targetTime) return true;
		const target = sydneyTimeOnDay(trip.targetTime, at);
		const deltaMins = (at.getTime() - target.getTime()) / 60_000;
		return deltaMins >= -90 && deltaMins <= 15;
	}

	const visible = $derived(trips.filter((r) => isRelevant(r.trip, now)));
</script>

{#if visible.length > 0}
	<section
		class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
	>
		<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
			Bus
		</h2>

		<div class="mt-3 space-y-4">
			{#each visible as r (r.kids.join('+') + r.trip.label)}
				<div>
					<div class="text-sm font-medium text-slate-700 dark:text-neutral-200">
						{r.kids.join(' & ')}
						<span class="text-slate-400 dark:text-neutral-500">— {r.trip.label}</span>
						{#if r.trip.targetTime}
							<span class="text-slate-400 dark:text-neutral-500"
								>@ {sydneyTimeCompact(sydneyTimeOnDay(r.trip.targetTime))}</span
							>
						{/if}
					</div>

					{#if r.departures.length === 0}
						<div class="mt-1 text-sm text-slate-400 italic dark:text-neutral-500">
							no buses in window
						</div>
					{:else}
						<ul class="mt-1 space-y-0.5">
							{#each r.departures as d (d.estimatedAt + d.route)}
								{@const due = minsFromNow(d.estimatedAt)}
								<li class="text-sm text-slate-700 tabular-nums dark:text-neutral-200">
									<span class="font-semibold">{d.route}</span>
									at {sydneyTimeCompact(asDate(d.estimatedAt))}
									<span class="text-slate-400 dark:text-neutral-500">({due} min)</span>
									{#if !d.realtime}<span class="text-xs text-slate-400 dark:text-neutral-500"
											>[scheduled]</span
										>{/if}
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/each}
		</div>
	</section>
{/if}
