<!--
  /admin sub-navigation — sibling-tabs across the admin debug sub-routes.
  Same nav-link pattern as the root +layout.svelte (pathname-based active
  state). Skipping shadcn Tabs since each tab maps 1:1 to a route, not to
  in-page state — URL-routed tabs are clickable links, not state buttons.
-->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let { children } = $props();

	const tabs = [
		{ href: resolve('/admin'), label: 'Overview' },
		{ href: resolve('/admin/sentral'), label: 'Sentral' },
		{ href: resolve('/admin/jobs'), label: 'Jobs' },
		{ href: resolve('/admin/print'), label: 'Print' },
		{ href: resolve('/admin/agent'), label: 'Agent' },
		{ href: resolve('/admin/logs'), label: 'Logs' }
	];

	function isActive(href: string, current: string): boolean {
		if (href === resolve('/admin')) return current === resolve('/admin');
		return current.startsWith(href);
	}
</script>

<div class="border-b border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
	<div class="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4">
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class={[
					'-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium transition',
					isActive(tab.href, page.url.pathname)
						? 'border-slate-900 text-slate-900 dark:border-neutral-100 dark:text-neutral-100'
						: 'border-transparent text-slate-500 hover:text-slate-800 dark:text-neutral-500 dark:hover:text-neutral-200'
				]}
			>
				{tab.label}
			</a>
		{/each}
	</div>
</div>

{@render children()}
