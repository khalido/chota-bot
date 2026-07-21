<!--
  App-wide error fallback. Without this, any loader throw (or a 404) drops the
  fullscreen kiosk onto SvelteKit's unstyled default error page. This one is
  dark-aware and matches the dashboard chrome. `page.status`/`page.error.message`
  come from the nearest thrown error.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
</script>

<svelte:head><title>Chota — {page.status}</title></svelte:head>

<main
	class="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-100 px-6 text-center dark:bg-neutral-950"
>
	<p class="text-6xl font-light text-slate-300 tabular-nums dark:text-neutral-700">
		{page.status}
	</p>
	<p class="text-lg text-slate-600 dark:text-neutral-300">
		{page.error?.message ?? 'Something went wrong.'}
	</p>
	<a
		href={resolve('/')}
		class="mt-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
	>
		Back to the dashboard
	</a>
</main>
