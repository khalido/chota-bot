<script lang="ts">
	import type { PrintSection } from '$lib/server/print/sections';
	import {
		Sun,
		CloudSun,
		Cloudy,
		CloudDrizzle,
		CloudRain,
		CloudFog,
		CloudLightning,
		CloudSnow,
		Wind,
		Volleyball,
		CalendarDays,
		Bus as BusIcon
	} from '@lucide/svelte';
	// One-off per-icon imports — tree-shake-friendly; the bulk import above
	// is grandfathered. New additions: this form.
	import BellRing from '@lucide/svelte/icons/bell-ring';
	import Frown from '@lucide/svelte/icons/frown';

	let {
		date,
		sections,
		closing,
		/** "Thu 21st May, 6:47am" — receipt-style footer line. */
		printedAt,
		/** Masthead badge: a single char → that letter as a monogram; otherwise the sparkle. */
		mark
	}: {
		date: string;
		sections: PrintSection[];
		closing: string;
		printedAt: string;
		mark?: string;
	} = $props();

	const pad2 = (n: number) => String(n).padStart(2, '0');
	const monogram = $derived(mark && mark.trim().length === 1 ? mark.trim().toUpperCase() : null);

	// Footnote ink: a dark grey so the bus/sports lines read as secondary without
	// being so light that thermal dithering loses them.
	const FOOTNOTE = '#4a4a4a';

	// lucide-icon key (from `weatherGlyph`) → component. CloudSun is the fallback.
	const WEATHER_ICONS: Record<string, typeof Sun> = {
		sun: Sun,
		'cloud-sun': CloudSun,
		cloudy: Cloudy,
		'cloud-drizzle': CloudDrizzle,
		'cloud-rain': CloudRain,
		'cloud-fog': CloudFog,
		'cloud-lightning': CloudLightning,
		'cloud-snow': CloudSnow,
		wind: Wind
	};
	const weatherIcon = (key: string) => WEATHER_ICONS[key] ?? CloudSun;

	const prettyWeather = (line: string, first: boolean) =>
		(first ? line.replace(/^\[\s*(.+?)\s*\]\s*/, '$1  ') : line).replace(/^->\s/, '→ ');
</script>

{#snippet sectionHeader(n: number, title: string)}
	<div class="flex items-center gap-3">
		<h2 class="text-xl font-bold tracking-wide whitespace-nowrap">{title}</h2>
		<div class="h-0 flex-1 border-b-2 border-dashed border-black"></div>
		<span class="text-sm tabular-nums" style:color={FOOTNOTE}>{pad2(n)}</span>
	</div>
{/snippet}

{#snippet footnote(Icon: typeof BusIcon, text: string)}
	<div class="mt-1.5 flex items-center gap-1.5 text-[13px]" style:color={FOOTNOTE}>
		<Icon size={16} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
		<span>{text}</span>
	</div>
{/snippet}

<!-- The receipt body. 576px = the 80mm thermal head; black ink on white only
     (gray fills dither badly). Text is bumped up a notch from screen sizes —
     thermal dot-matrix gets hard to read when it's small. `mx-auto` only
     matters when shown under the dashboard nav (the /print preview); the
     screenshot path renders /print/<who> bare so the viewport is 576px exactly.
     Typography is set once here (.plex / font-medium / text-[17px]) so every
     section inherits it; only the per-section header chrome is shared, via
     the snippet above — section *bodies* lay out freely. -->
<div
	class="plex mx-auto w-[576px] bg-white px-6 py-6 text-[17px] leading-snug font-medium text-black"
>
	<header class="flex items-end justify-between gap-4">
		<h1 class="border-b-2 border-black pb-1.5 text-2xl font-bold tracking-tight">{date}</h1>
		<svg width="58" height="58" viewBox="0 0 48 48" class="shrink-0" aria-hidden="true">
			<rect x="2" y="2" width="44" height="44" rx="11" fill="black" />
			<rect
				x="6.5"
				y="6.5"
				width="35"
				height="35"
				rx="7.5"
				fill="none"
				stroke="#fff"
				stroke-width="1.6"
			/>
			{#if monogram}
				<text
					x="24"
					y="34"
					text-anchor="middle"
					fill="#fff"
					font-family="'IBM Plex Mono', ui-monospace, monospace"
					font-weight="800"
					font-size="30">{monogram}</text
				>
			{:else}
				<path
					d="M22 12 L25.2 20.8 L34 24 L25.2 27.2 L22 36 L18.8 27.2 L10 24 L18.8 20.8 Z"
					fill="#fff"
				/>
				<path
					d="M34 10 L35.4 13.6 L39 15 L35.4 16.4 L34 20 L32.6 16.4 L29 15 L32.6 13.6 Z"
					fill="#fff"
				/>
				<circle cx="13" cy="35" r="2.2" fill="#fff" />
			{/if}
		</svg>
	</header>

	{#each sections as s (s.n)}
		<section class="mt-5">
			{@render sectionHeader(s.n, s.title)}
			<div class="mt-2">
				{#if s.kind === 'weather'}
					{@const Icon = weatherIcon(s.icon)}
					<div class="flex items-center justify-between gap-4">
						<div class="min-w-0 flex-1">
							{#each s.lines as line, i (i)}
								{@const isTomorrow = /^tmrw\b/i.test(line)}
								{#if isTomorrow}
									<!-- Tomorrow's one-line outlook: a labelled line, not an
									     arrow bullet, so it doesn't read as today's weather. -->
									<p class="mt-2 whitespace-pre-wrap">
										<span class="font-bold">Tomorrow:</span>
										{line.replace(/^tmrw:?\s*/i, '')}
									</p>
								{:else}
									<p class="whitespace-pre-wrap {i === 0 ? 'text-lg' : ''}">
										{prettyWeather(line, i === 0)}
									</p>
								{/if}
							{/each}
						</div>
						<Icon size={72} strokeWidth={2} class="shrink-0" aria-hidden="true" />
					</div>
				{:else if s.kind === 'lines'}
					{#each s.lines as line (line)}
						<p class="whitespace-pre-wrap">{line}</p>
					{/each}
				{:else if s.kind === 'events'}
					<ul class="space-y-1.5">
						{#each s.events as e, i (i)}
							<li class="flex items-baseline gap-2">
								<span class="flex-1">{e.summary}</span>
								<span class="shrink-0 text-[13px] tabular-nums">{e.time}</span>
								{#each e.people as p (p)}
									<span
										class="shrink-0 rounded border border-black px-1.5 text-[13px] font-semibold uppercase"
										>{p}</span
									>
								{/each}
							</li>
						{/each}
						{#if s.events.length && s.tasks.length}
							<!-- A faint divider between the calendar events and the to-dos. -->
							<li
								aria-hidden="true"
								class="border-t border-dashed"
								style:border-color={FOOTNOTE}
							></li>
						{/if}
						{#each s.tasks as t, i (`task-${i}`)}
							<!-- items-center (not items-baseline) so the BellRing icon sits
							     vertically centred with the SAVI/YASI chips on single-line tasks.
							     The .flex-1 span still wraps when the task title is long. -->
							<li class="flex items-center gap-2">
								<span class="flex-1">{t.title}</span>
								{#if t.when === 'today' || t.when === 'overdue'}
									<!-- BellRing as a due-urgency indicator (no bell on tmrw —
									     that's still text). Escalation ramp:
									       today / 1-day late → 1 bell
									       2 days late        → 2 bells
									       …                   → +1 bell per day
									       8+ days late       → 8 bells + a Frown (we've maxed
									                                          out the bells, time
									                                          for an emoji)
									     size 22 + strokeWidth 2.5 keep the line weight legible
									     after the 203dpi ESC/POS dither pass; -space-x-1
									     overlaps the bells slightly so 8 still fits on the row. -->
									{@const late = t.daysLate ?? 0}
									{@const bells = Array.from({ length: Math.max(1, Math.min(8, late)) })}
									<span
										aria-label={t.when === 'today'
											? 'due today'
											: `overdue by ${late} day${late === 1 ? '' : 's'}`}
										class="flex shrink-0 items-center -space-x-1"
									>
										{#each bells as _, i (i)}
											<BellRing class="stroke-black" size={22} strokeWidth={2.5} />
										{/each}
										{#if late >= 8}
											<!-- Frown sits past the overlapping-bell cluster (ml-1.5
											     to break the overlap) so it reads as punctuation
											     after the bells: 🔔🔔🔔🔔🔔🔔🔔🔔  😟 -->
											<Frown
												class="ml-1.5 stroke-black"
												size={22}
												strokeWidth={2.5}
											/>
										{/if}
									</span>
								{:else if t.when === 'tomorrow'}
									<!-- "tomorrow" tasks are early — no urgency indicator, just
									     an outlined tmrw chip so it's clear which lines aren't
									     for today. -->
									<span
										class="shrink-0 rounded border border-black px-1.5 text-[13px] font-semibold uppercase"
										>tmrw</span
									>
								{/if}
								{#each t.people as p (p)}
									<span
										class="shrink-0 rounded border border-black px-1.5 text-[13px] font-semibold uppercase"
										>{p}</span
									>
								{/each}
							</li>
						{/each}
					</ul>
				{:else if s.kind === 'chores'}
					<ul class="space-y-1.5">
						{#each s.rows as r (r.person)}
							<li class="flex items-baseline gap-3">
								<span class="w-16 shrink-0 font-semibold">{r.person}</span>
								<span class="flex-1">{r.chores}</span>
							</li>
						{/each}
					</ul>
				{:else if s.kind === 'shopping'}
					{#if s.items.length}
						<p class="leading-relaxed">{s.items.join('  ·  ')}</p>
					{/if}
					{#if s.bought.length}
						<p class="leading-relaxed {s.items.length ? 'mt-3' : ''}">
							<span class="font-semibold">Recently bought:</span>
							{s.bought.join('  ·  ')}
						</p>
					{/if}
				{:else if s.kind === 'schedule'}
					<ul class="space-y-2">
						{#each s.rows as r, i (i)}
							<li class="flex items-center gap-3">
								<div class="min-w-0 flex-1">
									<div class="flex items-baseline gap-2">
										<span class="min-w-0 flex-1 truncate font-semibold">{r.subject}</span>
										<span class="shrink-0 text-[13px] tabular-nums">{r.time}</span>
									</div>
									{#if r.teacher || r.code}
										<div class="text-[13px]">
											{[r.teacher ? `with ${r.teacher}` : '', r.code ? `(${r.code})` : '']
												.filter(Boolean)
												.join(' ')}
										</div>
									{/if}
								</div>
								{#if r.room}
									<span
										class="shrink-0 rounded border border-black px-2 py-1 text-lg font-bold tracking-tight tabular-nums"
										>{r.room}</span
									>
								{/if}
							</li>
						{/each}
					</ul>
					{#if s.reminder}{@render footnote(Volleyball, s.reminder)}{/if}
					{#each s.upcoming ?? [] as u (u.label + u.when)}
						{@render footnote(CalendarDays, `${u.label} — ${u.when}`)}
					{/each}
					{#if s.busLine}
						<!-- The school-run bus line — a touch larger than the other
						     footnotes; it's the actionable "leave by" detail. -->
						<div class="mt-2.5 flex items-center gap-2 text-[15px]" style:color={FOOTNOTE}>
							<BusIcon size={18} strokeWidth={1.75} class="shrink-0" aria-hidden="true" />
							<span>{s.busLine}</span>
						</div>
					{/if}
				{:else if s.kind === 'puzzle'}
					<div class="border-2 border-black p-3 leading-relaxed">{s.q}</div>
				{:else if s.kind === 'fact'}
					<p class="leading-relaxed">{s.text}</p>
					{#if s.image}
						<!-- Only present when `print.factImage` is enabled (sections.ts). -->
						<img src={s.image} alt="" class="mt-3 w-full" />
					{/if}
				{:else if s.kind === 'quote'}
					<!-- The attribution rides the same line as the quote, wrapping only
					     if it doesn't fit — italic + grey so it reads as a footnote. -->
					<p class="leading-relaxed whitespace-pre-wrap">
						{s.lines.join('\n')}<span class="ml-2 text-[14px] italic" style:color={FOOTNOTE}
							>— {s.attribution}</span
						>
					</p>
				{:else}
					<!-- Backstop: a section kind with no branch above renders visibly,
					     not as a silent blank. sectionsToText has a compile-time guard. -->
					<p class="text-sm font-semibold">⚠ unrendered section</p>
				{/if}
			</div>
		</section>
	{/each}

	<div class="mt-7 border-t-2 border-dashed border-black pt-3 text-center font-semibold">
		{closing.replace(' -- ', ' — ')}
	</div>
	<p class="mt-2 text-center text-[11px]" style:color={FOOTNOTE}>printed {printedAt}</p>
</div>
