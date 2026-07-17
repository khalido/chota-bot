<script lang="ts">
	import type { PageData } from './$types';
	import type { BlockName } from '$lib/server/tools/weather';

	let { data }: { data: PageData } = $props();

	const BLOCK_ORDER: BlockName[] = ['Morning', 'Noon', 'Evening', 'Night'];

	function colorFor(condition: string): string {
		const c = condition.toLowerCase();
		if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) {
			return 'text-sky-600 dark:text-sky-400';
		}
		if (c.includes('storm') || c.includes('thunder')) {
			return 'text-indigo-600 dark:text-indigo-400';
		}
		if (c.includes('cloud') || c.includes('overcast')) {
			return 'text-slate-500 dark:text-neutral-400';
		}
		if (c.includes('clear') || c.includes('sunny')) {
			return 'text-amber-600 dark:text-amber-400';
		}
		return 'text-slate-700 dark:text-neutral-300';
	}
</script>

<svelte:head><title>Chota — Weather</title></svelte:head>

<main class="min-h-screen bg-slate-50 px-6 py-10 dark:bg-neutral-950">
	<div class="mx-auto max-w-4xl space-y-8">
		<!-- Current + headline -->
		<section>
			<h1
				class="text-sm font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500"
			>
				{data.suburb}
			</h1>

			<div class="mt-3 flex items-baseline gap-6">
				<div
					class="text-7xl font-light text-slate-900 tabular-nums sm:text-8xl dark:text-neutral-50"
				>
					{Math.round(data.weather.tempC)}&deg;
				</div>
				<div class="text-2xl text-slate-600 sm:text-3xl dark:text-neutral-300">
					{data.weather.condition}
				</div>
			</div>

			<dl
				class="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-4 dark:text-neutral-400"
			>
				<div>
					<dt class="text-slate-400 dark:text-neutral-500">Feels like</dt>
					<dd class="tabular-nums">{Math.round(data.weather.feelsLikeC)}&deg;</dd>
				</div>
				<div>
					<dt class="text-slate-400 dark:text-neutral-500">Wind</dt>
					<dd class="tabular-nums">{Math.round(data.weather.windKmh)} km/h</dd>
				</div>
				<div>
					<dt class="text-slate-400 dark:text-neutral-500">UV index</dt>
					<dd class="tabular-nums">{Math.round(data.weather.uvIndex)}</dd>
				</div>
				<div>
					<dt class="text-slate-400 dark:text-neutral-500">Humidity</dt>
					<dd class="tabular-nums">{Math.round(data.weather.humidityPct)}%</dd>
				</div>
			</dl>

			<div
				class="mt-6 space-y-2 rounded-lg bg-white px-4 py-3 ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
			>
				<p class="text-base font-medium text-slate-800 dark:text-neutral-100">
					&rarr; {data.headline}
				</p>
				{#if data.tomorrow}
					<p class="text-sm text-slate-500 dark:text-neutral-400">
						{data.tomorrow}
					</p>
				{/if}
			</div>
		</section>

		<!-- Day × block grid -->
		<section>
			<h2
				class="mb-3 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500"
			>
				Forecast
			</h2>

			<div
				class="overflow-hidden rounded-xl bg-white ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
			>
				<!-- Header row -->
				<div class="grid grid-cols-5 gap-px bg-slate-200 dark:bg-neutral-800">
					<div
						class="bg-slate-50 px-4 py-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:bg-neutral-900 dark:text-neutral-500"
					>
						Day
					</div>
					{#each BLOCK_ORDER as block (block)}
						<div
							class="bg-slate-50 px-4 py-2 text-xs font-semibold tracking-wider text-slate-500 uppercase dark:bg-neutral-900 dark:text-neutral-500"
						>
							{block}
						</div>
					{/each}
				</div>

				<!-- Day rows -->
				{#each data.days as day (day.dateKey)}
					<div class="grid grid-cols-5 gap-px bg-slate-200 dark:bg-neutral-800">
						<div
							class="bg-white px-4 py-3 text-sm font-medium text-slate-700 dark:bg-neutral-900 dark:text-neutral-200"
						>
							{day.label}
						</div>
						{#each BLOCK_ORDER as block (block)}
							{@const cell = day.blocks[block]}
							{@const isPast = day.pastBlocks.includes(block)}
							<div
								class={[
									'px-4 py-3 text-sm',
									isPast
										? 'bg-slate-50 opacity-50 dark:bg-neutral-950'
										: 'bg-white dark:bg-neutral-900'
								]}
							>
								{#if cell}
									<div class={colorFor(cell.condition)}>{cell.condition}</div>
									<div class="text-slate-700 tabular-nums dark:text-neutral-300">
										{Math.round(cell.tempC)}&deg;
									</div>
									{#if cell.rainPct > 0}
										<div class="text-xs text-sky-600 dark:text-sky-400">
											{cell.rainPct}% rain
										</div>
									{/if}
								{:else if isPast}
									<div class="text-xs text-slate-400 italic dark:text-neutral-600">past</div>
								{:else}
									<div class="text-slate-300 dark:text-neutral-700">—</div>
								{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	</div>
</main>
