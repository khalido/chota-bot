<!--
  The receiver's one page: the waiting clock until a sender sends screens, then the screen on show under a row of tab
  labels. Everything drifts a few pixels over minutes so nothing sits still on the panel for hours.

  Remote (keys.ts): Back closes the app. Left and right switch screens. Up and down move a focus ring over the rows of
  the screen ([data-item] elements). Every other key (Enter, media, colour and digit keys) goes to the senders as a
  `key` message with the screen and the focused item, and keeps its default so the TV's own keys still work.
-->
<script lang="ts">
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import BlockView from './blocks/Block.svelte';
	import { layout } from './layout.ts';
	import HtmlScreen from './HtmlScreen.svelte';
	import { ROTATE_PAUSE_MS, type KeyEvent } from '../protocol/schema.ts';
	import { keyAction } from './keys.ts';
	import { SITE } from '../config.ts';
	import { hourOf, longDate, time, view } from './view.svelte.ts';

	let {
		close,
		select,
		sendKey
	}: { close: () => void; select: (id: string) => void; sendKey: (k: KeyEvent) => void } = $props();

	const STALE_MS = 10 * 60_000;
	/** The focus ring goes after this long without a key, so nothing is left highlighted. */
	const FOCUS_MS = 30_000;

	const screens = $derived(view.state.screens);
	const current = $derived(screens.find((s) => s.id === view.state.current) ?? screens[0]);
	/** When the board's data is old, the corner mark says when it was last updated instead of the site. */
	const staleSince = $derived(
		current && view.state.updatedAt && view.now - view.state.updatedAt > STALE_MS
			? view.state.updatedAt
			: 0
	);

	const grid = $derived(layout(current?.blocks ?? [], current?.columns ?? 2, current?.rows));
	/** The header clock steps aside when the screen has its own clock. */
	const ownClock = $derived(current?.blocks?.some((b) => b.type === 'clock') ?? false);

	/**
	 * A faint wash of colour from the top that follows the day: dawn peach, clear day, dusk amber, night blue. Dim
	 * enough to sit on OLED black all day.
	 */
	const TINTS: [number, string][] = [
		[0, '40 60 120'],
		[5, '40 60 120'],
		[7, '200 120 90'],
		[10, '120 130 140'],
		[16, '120 130 140'],
		[18, '210 120 60'],
		[20, '40 60 120']
	];
	function tint(ms: number) {
		const h = hourOf(ms);
		const at = TINTS.findLast(([start]) => start <= h) ?? TINTS[0];
		return `radial-gradient(120% 70% at 50% -20%, rgb(${at[1]} / 0.13), transparent 70%)`;
	}

	/** A slow loop of a few pixels (or, waiting, a wider wander), one cycle every `period` ms. */
	function drift(now: number, px: number, period: number) {
		const t = (now % period) / period;
		return `translate(${(Math.sin(t * 2 * Math.PI) * px).toFixed(1)}px, ${(Math.sin(t * 4 * Math.PI) * px * 0.6).toFixed(1)}px)`;
	}

	$effect(() => {
		const root = document.documentElement;
		const { accent, density, brightness } = view.state.theme;
		root.style.setProperty('--accent', accent ?? '#d9a55b');
		root.dataset.density = density ?? 'comfortable';
		root.dataset.brightness = brightness ?? 'normal';
	});

	// Plain lets: timestamps the effects read but must not be driven by.
	let lastKey = 0;
	let shownAt = Date.now();
	let focused = $state(-1);
	let section: HTMLElement | undefined = $state();

	const rows = () => [...(section?.querySelectorAll<HTMLElement>('[data-item]') ?? [])];
	/** The sender's id for a row, or "<block>.<row>" from 0. */
	function itemId(el: HTMLElement) {
		if (el.dataset.itemId) return el.dataset.itemId;
		const cell = el.closest<HTMLElement>('[data-block]');
		if (!cell) return undefined;
		return `${cell.dataset.block}.${[...cell.querySelectorAll('[data-item]')].indexOf(el)}`;
	}

	function step(by: number) {
		if (!current || screens.length < 2) return;
		const at = screens.findIndex((s) => s.id === current.id);
		select(screens[(at + by + screens.length) % screens.length].id);
	}

	// New content or another screen: no focus, and the rotate clock starts again.
	$effect(() => {
		void view.state;
		void current?.id;
		focused = -1;
		shownAt = Date.now();
	});

	// Draw the focus ring on the focused row, and bring it into view.
	$effect(() => {
		const f = focused;
		void view.state;
		const els = rows();
		els.forEach((el, i) => el.toggleAttribute('data-focused', i === f));
		if (f >= 0) els[f]?.scrollIntoView({ block: 'nearest' });
	});

	// Every second: drop an idle focus ring, and rotate when the theme asks and the remote is quiet.
	$effect(() => {
		const now = view.now;
		const every = view.state.theme.rotate;
		if (focused >= 0 && now - lastKey > FOCUS_MS) focused = -1;
		if (every && now - lastKey > ROTATE_PAUSE_MS && now - shownAt >= every * 1000) step(1);
	});

	function onkeydown(e: KeyboardEvent) {
		const action = keyAction(e.key, e.keyCode);
		if (action === 'ignore') return;
		lastKey = Date.now();
		// Only the keys we act on lose their default; the rest still reach the TV (Home, volume, input, assistant).
		if (action !== 'send') e.preventDefault();
		if (action === 'back') close();
		else if (action === 'left' || action === 'right') step(action === 'right' ? 1 : -1);
		else if (action === 'up' || action === 'down') {
			const n = rows().length;
			if (n === 0) return;
			if (focused < 0) focused = action === 'down' ? 0 : n - 1;
			else focused = Math.min(n - 1, Math.max(0, focused + (action === 'down' ? 1 : -1)));
		} else {
			const el = focused >= 0 ? rows()[focused] : undefined;
			sendKey({
				v: 1,
				type: 'key',
				key: e.key,
				code: e.code || undefined,
				keyCode: e.keyCode,
				screen: current?.id,
				item: el && itemId(el)
			});
		}
	}

	const banner = $derived(
		view.state.banner && view.now < view.state.banner.until ? view.state.banner : undefined
	);
	const TONE = {
		info: 'border-l-accent',
		good: 'border-l-emerald-400/70',
		warn: 'border-l-amber-400/80',
		bad: 'border-l-rose-400/80'
	};
</script>

<svelte:document {onkeydown} />

<div class="pointer-events-none fixed inset-0" style:background={tint(view.now)}></div>

<!-- The corner mark: what this app is, small and dim, drifting so it never sits on the same pixels. Amber when the
     board's data is stale. -->
<div
	class="pointer-events-none fixed right-[2.4rem] bottom-[1.2rem] text-[0.75rem] tracking-wide {staleSince
		? 'text-amber-400/70'
		: 'text-neutral-600'}"
	style:transform={drift(view.now, 6, 20 * 60_000)}
>
	{staleSince ? `updated ${time(staleSince)}` : SITE}
</div>

{#if !current}
	<main class="relative grid h-full place-items-center">
		<div class="text-center" style:transform={drift(view.now, 60, 30 * 60_000)}>
			<div
				class="text-[12rem] leading-none font-extralight tracking-tight text-neutral-400 tabular-nums"
			>
				{time(view.now)}
			</div>
			<div class="font-display mt-6 text-[2.8rem] font-light text-neutral-500 italic">
				{longDate(view.now)}
			</div>
			<div class="mt-16 text-[1.5rem] tracking-wide text-neutral-500">Nothing on yet</div>
			<div class="mt-2 text-[1.2rem] tracking-wide text-neutral-600">Press Back to close</div>
		</div>
	</main>
{:else}
	<main
		class="relative flex h-full flex-col px-[5vw] py-[5vh]"
		style:transform={drift(view.now, 6, 20 * 60_000)}
	>
		<header class="flex min-h-[2.4rem] items-baseline gap-12">
			<nav class="flex min-w-0 flex-1 gap-10 overflow-hidden text-[1.5rem] whitespace-nowrap">
				{#if screens.length > 1}
					{#each screens as s (s.id)}
						<span class={s.id === current.id ? 'text-accent' : 'text-neutral-600'}>{s.title}</span>
					{/each}
				{/if}
			</nav>
			{#if !ownClock}
				<span class="text-[1.9rem] text-neutral-400 tabular-nums">{time(view.now)}</span>
			{/if}
		</header>

		<section class="mt-[3.5vh] min-h-0 flex-1" bind:this={section}>
			{#key current.id}
				{#if current.html}
					<div class="h-full" in:fade|global={{ duration: 800 }}>
						<HtmlScreen html={current.html.html} css={current.html.css} />
					</div>
				{:else}
					<div
						class="grid h-full gap-7"
						style:grid-template-columns="repeat({current.columns ?? 2}, minmax(0, 1fr))"
						style:grid-template-rows={grid.rows.map((w) => `minmax(0, ${w}fr)`).join(' ')}
					>
						{#each current.blocks ?? [] as block, i (i)}
							{@const cell = grid.cells[i]}
							<div
								in:fly|global={{ y: 18, duration: 800, delay: 80 * i, easing: cubicOut }}
								data-block={i}
								class="cell min-h-0 overflow-hidden"
								style:zoom={cell.zoom}
								style:border-width="{1 / cell.zoom}px"
								style:grid-row="{cell.row + 1} / span {cell.rows}"
								style:grid-column="{cell.col + 1} / span {cell.cols}"
							>
								<div
									class="h-full [mask-image:linear-gradient(to_bottom,black_calc(100%-2.2rem),transparent)] p-[2.2rem]"
								>
									<BlockView {block} />
								</div>
							</div>
						{/each}
					</div>
				{/if}
			{/key}
		</section>
	</main>
{/if}

{#if banner}
	<div
		class="pointer-events-none fixed inset-x-0 bottom-[7vh] flex justify-center px-[5vw]"
		in:fly|global={{ y: 30, duration: 700, easing: cubicOut }}
		out:fade|global={{ duration: 600 }}
	>
		<div
			class="max-w-[80vw] rounded-[1rem] border border-l-[0.5rem] border-white/10 bg-black px-[2.4rem] py-[1.4rem] text-[2.6rem] text-neutral-100 {TONE[
				banner.tone
			]}"
		>
			{banner.text}
		</div>
	</div>
{/if}
