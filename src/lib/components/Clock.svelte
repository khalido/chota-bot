<script lang="ts">
	import type { ClockQuote } from '$lib/server/tools/clock-quotes';
	import type { Weather } from '$lib/server/tools/weather';
	import { sydneyDateLong, sydneyDateShort, sydneyTimeShort } from '$lib/time';

	interface Props {
		quote: ClockQuote | null;
		size?: 'card' | 'full';
		/** Only used in size='full' — small chip in the corner. */
		weather?: Weather | null;
	}
	let { quote, size = 'card', weather = null }: Props = $props();

	let now = $state(new Date());

	$effect(() => {
		const id = setInterval(() => (now = new Date()), 1000);
		return () => clearInterval(id);
	});

	const time = $derived(sydneyTimeShort(now));
	const date = $derived(sydneyDateLong(now));
	const shortDate = $derived(sydneyDateShort(now));

	const hasHighlight = $derived(quote !== null && quote.before !== null && quote.after !== null);

	/**
	 * Length-tiered font size for the literary clock quote. Combines:
	 *   - tier (based on character count) → picks the rem range
	 *   - clamp() within the tier → fluid scaling across viewport widths
	 * Quote stays readable from short ("Midnight.") to long literary passages.
	 */
	function quoteFontSize(text: string): string {
		const len = text.length;
		if (len < 80) return 'clamp(2.5rem, 7vw, 6rem)';
		if (len < 160) return 'clamp(2rem, 5.5vw, 4.5rem)';
		if (len < 280) return 'clamp(1.5rem, 4vw, 3.25rem)';
		if (len < 450) return 'clamp(1.25rem, 3vw, 2.5rem)';
		return 'clamp(1.1rem, 2.4vw, 2rem)';
	}

	const quoteText = $derived(
		quote ? (quote.before ?? '') + quote.time_phrase + (quote.after ?? quote.quote) : ''
	);
	const quoteStyle = $derived(`font-size: ${quoteFontSize(quoteText)};`);

	/** Tiny ASCII-style condition glyph (renders consistently in mono, not as emoji). */
	function conditionGlyph(condition: string): string {
		const c = condition.toLowerCase();
		if (c.includes('storm') || c.includes('thunder')) return '~~';
		if (c.includes('rain') || c.includes('shower') || c.includes('drizzle')) return "''";
		if (c.includes('cloud') || c.includes('overcast')) return '~';
		if (c.includes('clear') || c.includes('sunny') || c.includes('fair')) return '*';
		if (c.includes('fog') || c.includes('mist') || c.includes('haze')) return '=';
		return '·';
	}
</script>

{#if size === 'full'}
	<!-- Literary clock — quote IS the surface, time_phrase highlighted within. -->
	<div
		class="relative flex min-h-screen flex-col justify-center bg-neutral-950 px-8 py-12 text-neutral-300 sm:px-16 sm:py-20"
	>
		<!-- Four-corner chips: time (TL), date (TR), weather (BL), author below quote (BR). -->
		<div
			class="absolute top-6 left-8 font-mono text-sm tracking-wider text-neutral-600 tabular-nums"
		>
			{time}
		</div>
		<div class="absolute top-6 right-8 font-mono text-sm tracking-wider text-neutral-600">
			{shortDate}
		</div>
		{#if weather}
			<div
				class="absolute bottom-6 left-8 font-mono text-sm tracking-wider text-neutral-600 tabular-nums"
			>
				{conditionGlyph(weather.condition)}&nbsp; {Math.round(weather.tempC)}&deg; {weather.condition}
			</div>
		{/if}

		{#if quote}
			<!-- Quote dominates. time_phrase is brighter + bolder than the surrounding text.
			     Font size scales with both content length and viewport. -->
			<blockquote class="font-serif leading-tight tracking-tight" style={quoteStyle}>
				{#if hasHighlight}
					<span class="text-neutral-500">{quote.before}</span><span
						class="font-bold text-neutral-50"
						style="font-size: 1.05em;">{quote.time_phrase}</span
					><span class="text-neutral-500">{quote.after}</span>
				{:else}
					<span class="text-neutral-300">{quote.quote}</span>
				{/if}
			</blockquote>

			<footer
				class="mt-8 text-right text-neutral-500"
				style="font-size: clamp(0.875rem, 1.5vw, 1.25rem);"
			>
				– {quote.author}, <cite class="italic">{quote.title}</cite>
			</footer>
		{:else}
			<div class="font-serif text-3xl text-neutral-500 italic">No quote for {time}.</div>
		{/if}
	</div>
{:else}
	<!-- Dashboard card — utilitarian, dense, glanceable. -->
	<section
		class="rounded-2xl bg-slate-900 p-6 text-slate-100 shadow-lg dark:bg-neutral-900 dark:ring-1 dark:ring-neutral-800"
	>
		<div class="flex items-baseline justify-between">
			<div class="text-5xl font-light tracking-tight tabular-nums">{time}</div>
			<div class="text-sm text-slate-400">{date}</div>
		</div>

		{#if quote}
			<blockquote class="mt-4 border-l-2 border-slate-700 pl-4 font-serif text-sm leading-relaxed">
				{#if hasHighlight}
					<span class="text-slate-400">{quote.before}</span><span
						class="font-semibold text-slate-50">{quote.time_phrase}</span
					><span class="text-slate-400">{quote.after}</span>
				{:else}
					<span class="text-slate-300">{quote.quote}</span>
				{/if}
				<footer class="mt-2 text-xs text-slate-500">
					– {quote.author}, <cite class="italic">{quote.title}</cite>
				</footer>
			</blockquote>
		{:else}
			<div class="mt-4 text-sm text-slate-500 italic">No quote for this minute.</div>
		{/if}
	</section>
{/if}
