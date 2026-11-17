<!--
  A slow, dim layer behind the weather numbers: a breathing glow for sun, drifting cloud, a few slow streaks of rain,
  falling snow, fog bands, faint stars at night. Transforms and opacity only (the TV composites them cheaply),
  nothing faster than a few seconds a cycle, nothing bright held still. Off under prefers-reduced-motion.
-->
<script lang="ts">
	import type { Sky } from './sky.ts';

	let { sky }: { sky: Sky } = $props();

	/** Fixed scatter (not random), so the layer looks the same after every update. */
	const scatter = (n: number, seed: number) =>
		Array.from({ length: n }, (_, i) => {
			const r = (k: number) =>
				(((Math.sin((i + 1) * 12.9898 * k + seed) * 43758.5453) % 1) + 1) % 1;
			return { x: r(1) * 100, y: r(2) * 100, d: r(3), e: r(4) };
		});
	const drops = scatter(14, 1);
	const flakes = scatter(18, 2);
	const stars = scatter(16, 3);
	const glow = $derived(sky === 'sun' || sky === 'partly');
	const clouds = $derived(sky === 'cloud' || sky === 'partly' || sky === 'storm' || sky === 'rain');
</script>

<div class="sky" aria-hidden="true">
	{#if glow}
		<div class="sun" class:soft={sky === 'partly'}></div>
	{/if}
	{#if clouds}
		<div class="cloud" style="top: 4%; animation-duration: 70s;"></div>
		<div
			class="cloud"
			style="top: 30%; left: 30%; animation-duration: 95s; animation-delay: -40s;"
		></div>
	{/if}
	{#if sky === 'rain' || sky === 'storm'}
		{#each drops as p, i (i)}
			<i
				class="drop"
				class:storm={sky === 'storm'}
				style="left: {p.x}%; animation-duration: {(sky === 'storm' ? 1.8 : 3) +
					p.d * 2}s; animation-delay: {-p.e * 5}s;"
			></i>
		{/each}
	{/if}
	{#if sky === 'snow'}
		{#each flakes as p, i (i)}
			<i
				class="flake"
				style="left: {p.x}%; animation-duration: {9 + p.d * 8}s; animation-delay: {-p.e * 17}s;"
			></i>
		{/each}
	{/if}
	{#if sky === 'fog'}
		<div class="fog" style="top: 25%;"></div>
		<div class="fog" style="top: 60%; animation-duration: 80s; animation-delay: -30s;"></div>
	{/if}
	{#if sky === 'night'}
		{#each stars as p, i (i)}
			<i
				class="star"
				style="left: {p.x}%; top: {p.y * 0.7}%; animation-duration: {5 +
					p.d * 6}s; animation-delay: {-p.e * 11}s;"
			></i>
		{/each}
	{/if}
</div>

<style>
	.sky {
		position: absolute;
		inset: -2.2rem;
		overflow: hidden;
		pointer-events: none;
		z-index: -1;
	}
	.sky > * {
		position: absolute;
		will-change: transform, opacity;
	}
	.sun {
		top: -14rem;
		right: -12rem;
		width: 34rem;
		height: 34rem;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgb(251 191 36 / 0.22),
			rgb(251 146 60 / 0.07) 45%,
			transparent 70%
		);
		animation: breathe 11s ease-in-out infinite alternate;
	}
	.sun.soft {
		opacity: 0.7;
	}
	.cloud {
		left: -30%;
		width: 26rem;
		height: 9rem;
		border-radius: 50%;
		background: radial-gradient(closest-side, rgb(203 213 225 / 0.07), transparent);
		animation: drift 80s ease-in-out infinite alternate;
	}
	.drop {
		top: 0;
		width: 0.09rem;
		height: 3.4rem;
		background: linear-gradient(transparent, rgb(125 180 240 / 0.38));
		animation: fall 4s linear infinite;
	}
	.drop.storm {
		background: linear-gradient(transparent, rgb(167 139 250 / 0.36));
	}
	.flake {
		top: 0;
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 50%;
		background: rgb(226 232 240 / 0.35);
		animation: snow 12s linear infinite;
	}
	.fog {
		left: -40%;
		width: 180%;
		height: 7rem;
		background: radial-gradient(closest-side, rgb(203 213 225 / 0.08), transparent);
		animation: drift 60s ease-in-out infinite alternate;
	}
	.star {
		width: 0.22rem;
		height: 0.22rem;
		border-radius: 50%;
		background: rgb(224 231 255 / 0.7);
		animation: twinkle 7s ease-in-out infinite alternate;
	}

	@keyframes breathe {
		from {
			opacity: 0.55;
			transform: scale(0.94);
		}
		to {
			opacity: 1;
			transform: scale(1.06);
		}
	}
	@keyframes drift {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(60%);
		}
	}
	@keyframes fall {
		from {
			transform: translateY(-4rem);
			opacity: 0;
		}
		15% {
			opacity: 1;
		}
		to {
			transform: translateY(32rem);
			opacity: 0.4;
		}
	}
	@keyframes snow {
		from {
			transform: translate(0, -2rem);
		}
		50% {
			transform: translate(1.2rem, 14rem);
		}
		to {
			transform: translate(-0.6rem, 30rem);
		}
	}
	@keyframes twinkle {
		from {
			opacity: 0.05;
		}
		to {
			opacity: 0.55;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.sky > * {
			animation: none;
		}
	}
</style>
