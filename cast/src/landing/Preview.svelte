<!--
  The real receiver in demo mode, scaled down from 1920×1080 and stepping through the sample screens. The whole
  picture is a link to the full-size demo; the frame itself takes no clicks.
-->
<script lang="ts">
	let width = $state(0);
</script>

<a
	href="/receiver?demo"
	class="group mt-8 block"
	aria-label="Open the demo screens at full size"
>
	<div
		bind:clientWidth={width}
		class="relative aspect-video overflow-hidden rounded-xl bg-[#0c0e11] shadow-lg ring-1 ring-black/10 transition group-hover:ring-current/40 dark:ring-white/10"
	>
		<iframe
			src="/receiver?demo&cycle=5"
			title="Demo screens"
			tabindex="-1"
			aria-hidden="true"
			class="pointer-events-none absolute top-0 left-0 h-[1080px] w-[1920px] origin-top-left border-0"
			style:transform="scale({width / 1920})"
		></iframe>
	</div>
	<p class="mt-2 text-sm opacity-70 group-hover:opacity-100">
		The demo screens, live from the receiver. Open full size →
	</p>
</a>
