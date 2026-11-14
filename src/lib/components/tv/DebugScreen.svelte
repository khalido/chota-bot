<!--
  TV "Debug": what the Cast proving page showed. The screen it was given,
  uptime, Cast status, the build, the last data refresh and the last remote
  keys. The page also reports these to /tv/probe for the Pi's log.
-->
<script lang="ts">
	import type { TvDebug } from './types.ts';

	let { debug }: { debug: TvDebug } = $props();
</script>

<div class="grid h-full grid-cols-2 gap-[5vw] text-neutral-300">
	<dl class="space-y-[2.5vh] text-[3.5vh]">
		<div>
			<dt class="text-[2.4vh] tracking-widest text-neutral-500 uppercase">Up</dt>
			<dd class="tabular-nums">{debug.uptime}</dd>
		</div>
		<div>
			<dt class="text-[2.4vh] tracking-widest text-neutral-500 uppercase">Cast</dt>
			<dd>{debug.cast}</dd>
		</div>
		<div>
			<dt class="text-[2.4vh] tracking-widest text-neutral-500 uppercase">Build</dt>
			<dd class="tabular-nums">{debug.version}</dd>
		</div>
		<div>
			<dt class="text-[2.4vh] tracking-widest text-neutral-500 uppercase">Data</dt>
			<dd>{debug.lastRefresh}</dd>
		</div>
		<div>
			<dt class="text-[2.4vh] tracking-widest text-neutral-500 uppercase">Screen</dt>
			<dd class="text-[2.2vh] break-words text-neutral-400">{debug.screen}</dd>
		</div>
	</dl>

	<section>
		<h2 class="text-[2.4vh] tracking-widest text-neutral-500 uppercase">Last keys</h2>
		<ol class="mt-[1vh] space-y-[0.6vh] text-[3.2vh]">
			{#each debug.keys as k (k.id)}
				<li>
					<b class="text-neutral-200">{k.key}</b>
					<span class="ml-[1vw] text-neutral-500">{k.code || '—'} · {k.at}</span>
				</li>
			{:else}
				<li class="text-neutral-500">Nothing yet</li>
			{/each}
		</ol>
	</section>
</div>
