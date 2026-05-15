<script lang="ts">
	import type { Weather } from '$lib/server/tools/weather';

	interface Props {
		weather: Weather | null;
		/** Pre-computed headline from weatherSummary() — passed in from the loader. */
		headline: string | null;
	}
	let { weather, headline }: Props = $props();
</script>

<section
	class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
>
	<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
		Weather
	</h2>

	{#if weather}
		<div class="mt-3 flex items-baseline gap-3">
			<div class="text-4xl font-light tabular-nums text-slate-800 dark:text-neutral-100">
				{Math.round(weather.tempC)}&deg;
			</div>
			<div class="text-sm text-slate-600 dark:text-neutral-400">{weather.condition}</div>
		</div>

		<p class="mt-1 text-xs text-slate-400 dark:text-neutral-500">
			Feels {Math.round(weather.feelsLikeC)}&deg;.
			{#if weather.uvIndex >= 1}
				UV {Math.round(weather.uvIndex)}.
			{/if}
		</p>

		{#if headline}
			<p class="mt-3 text-sm font-medium text-slate-700 dark:text-neutral-200">
				&rarr; {headline}
			</p>
		{/if}
	{:else}
		<p class="mt-3 text-sm text-slate-400 italic dark:text-neutral-500">Weather unavailable.</p>
	{/if}
</section>
