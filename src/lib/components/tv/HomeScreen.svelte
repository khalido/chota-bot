<!--
  TV "Home": the house in a paragraph and whether to open the windows, from
  @khalido/home through #lib/server/home.ts (the same reading the chat's
  home_status tool gives). Read-only: anything under /tv is open to the home
  network, so no controls here.
-->
<script lang="ts">
	import type { Ventilation } from '@khalido/home';

	type House = { summary: string; windows: Ventilation };
	let { home = null }: { home?: House | null } = $props();

	const WINDOWS: Record<string, string> = {
		open: 'Open the windows',
		close: 'Keep the windows shut',
		either: 'Windows: either way',
		unknown: 'Windows: no inside reading'
	};
</script>

<div class="flex h-full items-center justify-center">
	{#if home}
		<div class="max-w-[80vw]">
			<p class="text-[4.5vh] leading-snug text-neutral-200">{home.summary}</p>
			<p class="mt-[5vh] text-[4vh] text-amber-300">
				{WINDOWS[home.windows.advice] ?? home.windows.advice}{home.windows.why
					? ` · ${home.windows.why}`
					: ''}
			</p>
		</div>
	{:else}
		<div class="rounded-[2vh] border border-neutral-800 px-[6vw] py-[8vh] text-center">
			<p class="text-[6vh] text-neutral-300">The house isn't connected</p>
			<p class="mt-[2vh] text-[3vh] text-neutral-500">No home config on this box yet</p>
		</div>
	{/if}
</div>
