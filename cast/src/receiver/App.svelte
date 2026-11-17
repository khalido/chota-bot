<!--
  The receiver's one page: the waiting clock until a sender sends screens, then the screen on show under a row of tab
  labels. Everything drifts a few pixels over minutes so nothing sits still on the panel for hours.
-->
<script lang="ts">
	import BlockView from './blocks/Block.svelte';
	import HtmlScreen from './HtmlScreen.svelte';
	import { longDate, time, view } from './view.svelte.ts';

	let { close }: { close: () => void } = $props();

	/** Keys that mean Back on the remotes and browsers we know of. Back always closes; it never navigates. */
	const BACK = new Set(['BrowserBack', 'GoBack', 'Escape', 'Back']);
	const STALE_MS = 10 * 60_000;

	const screens = $derived(view.state.screens);
	const current = $derived(screens.find((s) => s.id === view.state.current) ?? screens[0]);
	const updatedAgo = $derived(
		view.state.updatedAt && view.now - view.state.updatedAt > STALE_MS
			? Math.floor((view.now - view.state.updatedAt) / 60_000)
			: 0
	);

	/**
	 * Blocks are designed for a whole screen; a cell of a busier grid shows the same block smaller, so nothing is cut.
	 * By rows (1 to 4+) and by columns (1 to 4).
	 */
	const ROW_SCALE = [1, 1, 0.68, 0.52, 0.44];
	const COL_SCALE = [1, 1, 1, 0.82, 0.68];
	const scale = $derived.by(() => {
		const cols = current?.columns ?? 2;
		const cells = (current?.blocks ?? []).reduce((n, b) => n + Math.min(b.span ?? 1, cols), 0);
		const rows = Math.max(1, Math.ceil(cells / cols));
		return Math.min(ROW_SCALE[Math.min(rows, 4)], COL_SCALE[cols]);
	});

	/** A slow loop of a few pixels (or, waiting, a wider wander), one cycle every `period` ms. */
	function drift(now: number, px: number, period: number) {
		const t = (now % period) / period;
		return `translate(${(Math.sin(t * 2 * Math.PI) * px).toFixed(1)}px, ${(Math.sin(t * 4 * Math.PI) * px * 0.6).toFixed(1)}px)`;
	}

	$effect(() => {
		const root = document.documentElement;
		const { accent, density } = view.state.theme;
		root.style.setProperty('--accent', accent ?? '#d9a55b');
		root.dataset.density = density ?? 'comfortable';
	});

	function onkeydown(e: KeyboardEvent) {
		if (BACK.has(e.key) || e.keyCode === 461) {
			e.preventDefault();
			close();
		}
	}
</script>

<svelte:document {onkeydown} />

{#if !current}
	<main class="grid h-full place-items-center">
		<div class="text-center" style:transform={drift(view.now, 60, 30 * 60_000)}>
			<div
				class="text-[12rem] leading-none font-extralight tracking-tight text-neutral-400 tabular-nums"
			>
				{time(view.now)}
			</div>
			<div class="mt-6 text-[2.6rem] font-light text-neutral-500">{longDate(view.now)}</div>
			<div class="mt-16 text-[1.5rem] tracking-wide text-neutral-600">Waiting for a sender</div>
		</div>
	</main>
{:else}
	<main
		class="flex h-full flex-col px-[5vw] py-[5vh]"
		style:transform={drift(view.now, 6, 20 * 60_000)}
	>
		<header class="flex items-baseline gap-12">
			<nav class="flex min-w-0 flex-1 gap-10 overflow-hidden text-[1.6rem] whitespace-nowrap">
				{#each screens as s (s.id)}
					<span
						class={s.id === current.id
							? 'border-b-[0.2rem] border-accent pb-1 text-neutral-200'
							: 'pb-1 text-neutral-500'}>{s.title}</span
					>
				{/each}
			</nav>
			{#if updatedAgo}
				<span class="text-[1.3rem] text-neutral-500">Updated {updatedAgo} min ago</span>
			{/if}
			<span class="text-[1.9rem] text-neutral-400 tabular-nums">{time(view.now)}</span>
		</header>

		<section class="mt-[4vh] min-h-0 flex-1">
			{#key current.id}
				{#if current.html}
					<HtmlScreen html={current.html.html} css={current.html.css} />
				{:else}
					<div
						class="grid h-full auto-rows-[minmax(0,1fr)] gap-8"
						style:grid-template-columns="repeat({current.columns ?? 2}, minmax(0, 1fr))"
					>
						{#each current.blocks ?? [] as block, i (i)}
							<div
								class="min-h-0 overflow-hidden rounded-[1.4rem] bg-white/[0.035] [mask-image:linear-gradient(to_bottom,black_calc(100%-2.2rem),transparent)] p-[2.2rem]"
								style:zoom={scale}
								style:grid-column="span {Math.min(block.span ?? 1, current.columns ?? 2)}"
							>
								<BlockView {block} />
							</div>
						{/each}
					</div>
				{/if}
			{/key}
		</section>
	</main>
{/if}
