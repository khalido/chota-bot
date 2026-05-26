<!--
  The printed brief's masthead — the top band that shows whose sheet
  this is, what day it's for, and a per-person geometric pattern.
  Replaces the previous monogram-badge header inline in BriefSheet.svelte.

  Variants (one component, swappable rendering):
    'newspaper' (default) — name in big serif left, date in mono right,
                            deterministic SVG pattern square in the corner.
                            All typography + vector — dithers cleanly on
                            the 80mm thermal head.
    'portrait' (future)  — agent-generated stylised b&w portrait per kid
                            with a translucent date strip overlaid. Adds
                            an AI gen step + image cache; held for later.

  The pattern is deterministic from the recipient name (same kid → same
  pattern forever) so a brief feels like *their* paper, not a generic one.
  Kids can hand-replace with their own SVG sketch later by adding a file
  to `data/headers/<who>.svg` and tweaking the variant pick.
-->
<script lang="ts">
	/** Recipient name (kebab/lowercase from chota.config). Used for the title + the pattern seed. */
	let {
		who,
		date,
		variant = 'newspaper'
	}: {
		who: string;
		date: string;
		/** Rendering style. Default newspaper; 'portrait' reserved for the future AI variant. */
		variant?: 'newspaper';
	} = $props();

	const title = $derived(who.toUpperCase());

	// ── Pattern picker ──────────────────────────────────────────────────
	// Stable string hash (Java-style) — same name always picks the same
	// pattern family + tuning. Crypto-grade randomness isn't needed here;
	// we want repeatable + cheap.
	function hash(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) {
			h = (h * 31 + s.charCodeAt(i)) | 0;
		}
		return Math.abs(h);
	}

	type PatternFamily = 'hatch' | 'crosshatch' | 'dots' | 'arcs' | 'triangles' | 'chevrons';
	const FAMILIES: PatternFamily[] = ['hatch', 'crosshatch', 'dots', 'arcs', 'triangles', 'chevrons'];

	const seed = $derived(hash(who));
	const family = $derived<PatternFamily>(FAMILIES[seed % FAMILIES.length]);
	/** Tile size (px). 6 → dense, 12 → airy. */
	const tile = $derived(8 + (seed % 4));
	/** Pattern rotation (-22.5° / -7.5° / 7.5° / 22.5°) — adds visual variety per kid. */
	const angle = $derived(((seed >> 3) % 4) * 15 - 22.5);
	/** Stable DOM id for the SVG <pattern> — per-kid so multiple briefs on /print don't collide. */
	const patternId = $derived(`hdr-pat-${who}`);
</script>

<!--
  One-line layout: name dominates left, date right-aligned in mono, pattern
  square at the very end. ~60px tall — half the old header's footprint.
  Underlined with a thin dashed rule for the "tear here" / receipt vibe.
-->
<header class="flex items-center justify-between gap-3 border-b border-dashed border-black pb-2">
	<h1 class="font-serif text-[44px] leading-none font-bold tracking-tight">{title}</h1>

	<div class="flex items-center gap-3">
		<span class="font-mono text-[15px] tracking-wide tabular-nums">{date}</span>

		<!--
		  Per-person SVG pattern. patternUnits=userSpaceOnUse + a rotation
		  transform on the group gives us angle variety without re-rendering
		  the tile maths. 56x56 outer box; inner rect masks the pattern so
		  the rotated tile doesn't leak past the badge edge.
		-->
		<svg width="56" height="56" viewBox="0 0 56 56" class="shrink-0" aria-hidden="true">
			<defs>
				<pattern
					id={patternId}
					patternUnits="userSpaceOnUse"
					width={tile}
					height={tile}
					patternTransform={`rotate(${angle})`}
				>
					{#if family === 'hatch'}
						<line x1="0" y1="0" x2="0" y2={tile} stroke="black" stroke-width="1.6" />
					{:else if family === 'crosshatch'}
						<line x1="0" y1="0" x2="0" y2={tile} stroke="black" stroke-width="1.2" />
						<line x1="0" y1="0" x2={tile} y2="0" stroke="black" stroke-width="1.2" />
					{:else if family === 'dots'}
						<circle cx={tile / 2} cy={tile / 2} r={Math.max(1.4, tile / 5)} fill="black" />
					{:else if family === 'arcs'}
						<path
							d={`M0 ${tile} A ${tile} ${tile} 0 0 1 ${tile} 0`}
							fill="none"
							stroke="black"
							stroke-width="1.4"
						/>
					{:else if family === 'triangles'}
						<polygon points={`0,${tile} ${tile / 2},0 ${tile},${tile}`} fill="black" />
					{:else if family === 'chevrons'}
						<polyline
							points={`0,${tile} ${tile / 2},${tile / 2} ${tile},${tile}`}
							fill="none"
							stroke="black"
							stroke-width="1.6"
						/>
					{/if}
				</pattern>
			</defs>
			<rect x="0" y="0" width="56" height="56" fill={`url(#${patternId})`} />
			<rect x="0" y="0" width="56" height="56" fill="none" stroke="black" stroke-width="1.5" />
		</svg>
	</div>
</header>
