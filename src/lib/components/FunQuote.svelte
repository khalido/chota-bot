<script lang="ts">
	import type { Quote } from '$lib/server/tools/quotes';
	let { quote }: { quote: Quote | null } = $props();
</script>

<section
	class="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
>
	<h2 class="text-xs font-semibold tracking-wider text-slate-500 uppercase dark:text-neutral-500">
		Quote
	</h2>

	{#if quote}
		<blockquote class="mt-3">
			<p class="text-sm whitespace-pre-wrap text-slate-700 dark:text-neutral-200">{quote.quote}</p>
			<footer class="mt-2 text-xs text-slate-500 dark:text-neutral-500">
				— {quote.speaker ? `${quote.speaker}, ` : ''}{quote.title}
			</footer>
		</blockquote>
	{:else}
		<p class="mt-3 text-sm text-slate-400 italic dark:text-neutral-500">No quotes loaded.</p>
	{/if}
</section>
