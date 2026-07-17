<!--
  The printed brief's masthead — a compact band with the recipient's
  name, the day's date, and a subtle per-person hatch pattern behind
  them. Replaces the previous monogram-badge header.

  Variants (one component, swappable rendering):
    'newspaper' (default) — small serif name + bigger mono date, with a
                            light diagonal hatch fading behind the
                            whole band. Hatch angle is hashed off the
                            recipient name so each kid's sheet looks
                            subtly their own.
    'portrait' (future)  — agent-generated stylised b&w portrait per kid
                            with a translucent date strip overlaid. Adds
                            an AI gen step + image cache; held for later.

  Kids can hand-replace the hatch with their own SVG sketch later by
  dropping a file at `data/headers/<who>.svg` and adding a branch here.
-->
<script lang="ts">
	let {
		who,
		date,
		variant: _variant = 'newspaper'
	}: {
		/** Recipient name (kebab/lowercase). Drives the title + the pattern seed. */
		who: string;
		date: string;
		/** Rendering style. Default newspaper; 'portrait' reserved for the future AI variant. */
		variant?: 'newspaper';
	} = $props();

	const title = $derived(who.toUpperCase());

	// Stable string hash — same name always picks the same hatch angle.
	function hash(s: string): number {
		let h = 0;
		for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
		return Math.abs(h);
	}

	const seed = $derived(hash(who));
	/** Hatch rotation (-60° to +60° in 15° steps, never 0° or 90° — those are too "stripey"). */
	const angle = $derived(15 + (seed % 4) * 15 * (seed & 1 ? 1 : -1));
	/** Stable DOM id so multiple briefs on /print don't share the same pattern. */
	const patternId = $derived(`hdr-hatch-${who}`);
</script>

<!--
  Compact band: name + date sit on a relative-positioned container so the
  SVG hatch pattern fills the bg via absolute inset-0. The text is in a
  z-10 wrapper above. Border-bottom dashed rule still does the receipt-tear
  look. Light hatch = sparse tile + thin stroke — dithers to a subtle
  texture on the thermal head rather than a solid block.
-->
<header
	class="relative flex items-center justify-between gap-3 overflow-hidden border-b border-dashed border-black pb-2"
>
	<svg
		class="pointer-events-none absolute inset-0 h-full w-full"
		aria-hidden="true"
		preserveAspectRatio="none"
	>
		<defs>
			<pattern
				id={patternId}
				patternUnits="userSpaceOnUse"
				width="14"
				height="14"
				patternTransform={`rotate(${angle})`}
			>
				<line x1="0" y1="0" x2="0" y2="14" stroke="black" stroke-width="0.7" />
			</pattern>
		</defs>
		<rect x="0" y="0" width="100%" height="100%" fill={`url(#${patternId})`} />
	</svg>

	<h1 class="relative z-10 font-serif text-[28px] leading-none font-bold tracking-tight">
		{title}
	</h1>
	<span class="relative z-10 font-mono text-[20px] tracking-wide tabular-nums">{date}</span>
</header>
