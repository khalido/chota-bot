<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { sydneyHour } from '$lib/time';

	let { children } = $props();

	const tabs = [
		{ href: resolve('/'), label: 'Dashboard' },
		{ href: resolve('/clock'), label: 'Clock' },
		{ href: resolve('/weather'), label: 'Weather' },
		{ href: resolve('/lists'), label: 'Lists' },
		{ href: resolve('/print'), label: 'Print' },
		{ href: resolve('/admin'), label: 'Admin' }
	];

	function isActive(href: string, current: string): boolean {
		if (href === '/') return current === '/';
		return current === href || current.startsWith(href + '/');
	}

	// Sydney sunrise/sunset proxy: 06:00-17:59 = light, else dark.
	// Re-checked every 5 minutes so the theme shifts without a reload.
	function isDayInSydney(d: Date): boolean {
		const h = sydneyHour(d);
		return h >= 6 && h < 18;
	}

	function applyTheme() {
		document.documentElement.classList.toggle('dark', !isDayInSydney(new Date()));
	}

	$effect(() => {
		applyTheme();
		const id = setInterval(applyTheme, 5 * 60_000);
		return () => clearInterval(id);
	});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<!--
  Routes that suppress the dashboard nav:
    - /clock          — ambient clock view (idle-fallback from the kiosk)
    - /print/<who>    — single-person printed sheet; rendered bare so
                        agent-browser screenshots it pixel-clean for the
                        thermal printer. /print itself (the multi-person
                        preview) keeps the nav for admin use.
  This used to be gated on `?bare=1` — the query-string contract is now a
  pathname contract, so the URL self-documents the rendering mode.
-->
{#if page.url.pathname !== '/clock' && !page.url.pathname.match(/^\/print\/[^/]+$/)}
	<nav class="border-b border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
		<div class="mx-auto flex max-w-5xl gap-1 px-4">
			{#each tabs as tab (tab.href)}
				<a
					href={tab.href}
					class={[
						'-mb-px border-b-2 px-3 py-3 text-sm font-medium transition',
						isActive(tab.href, page.url.pathname)
							? 'border-slate-900 text-slate-900 dark:border-neutral-100 dark:text-neutral-100'
							: 'border-transparent text-slate-500 hover:text-slate-800 dark:text-neutral-500 dark:hover:text-neutral-200'
					]}
				>
					{tab.label}
				</a>
			{/each}
		</div>
	</nav>
{/if}

{@render children()}
