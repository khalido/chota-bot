<!--
  TV "Today": clock and date, weather now and the next hours, today's
  calendar, the next buses. Read from across the room: sizes in vh.
-->
<script lang="ts">
	import type { TripReport } from '#lib/server/print/brief.ts';
	import type { Weather } from '#lib/server/tools/weather.ts';
	import { sydneyDateLong, sydneyTimeCompact, sydneyTimeShort, sydneyYMD } from '#lib/time.ts';
	import type { CalendarEvent } from '#lib/server/tools/calendar.ts';

	interface Props {
		now: Date;
		weather: Weather | null;
		headline: string | null;
		events: CalendarEvent[];
		trips: TripReport[];
	}
	let { now, weather, headline, events, trips }: Props = $props();

	const MAX_EVENTS = 6;
	const HOURS = 6;
	const BUSES_PER_TRIP = 3;

	const today = $derived(events.filter((e) => sydneyYMD(e.start) === sydneyYMD(now)));
	const nextHours = $derived(
		(weather?.hourly ?? []).filter((h) => h.at.getTime() > now.getTime()).slice(0, HOURS)
	);

	const minsFromNow = (d: Date) => Math.round((d.getTime() - now.getTime()) / 60_000);

	// Departures still to come. The loader picks them (around a trip's target
	// time, or the next few); this only drops the ones already gone.
	const buses = $derived(
		trips
			.map((r) => ({
				...r,
				departures: r.departures
					.filter((d) => d.estimatedAt.getTime() >= now.getTime())
					.slice(0, BUSES_PER_TRIP)
			}))
			.filter((r) => r.departures.length > 0)
	);
</script>

<div class="grid h-full grid-cols-[1fr_1.15fr] gap-[5vw]">
	<div class="flex min-h-0 flex-col">
		<div class="text-[17vh] leading-none font-light tracking-tight text-neutral-200 tabular-nums">
			{sydneyTimeShort(now)}
		</div>
		<div class="mt-[1.5vh] text-[4.5vh] text-neutral-400">{sydneyDateLong(now)}</div>

		<section class="mt-[6vh]">
			{#if weather}
				<div class="flex items-baseline gap-[2vw]">
					<span class="text-[11vh] leading-none font-light text-neutral-200 tabular-nums"
						>{Math.round(weather.tempC)}&deg;</span
					>
					<span class="text-[4.5vh] text-neutral-300">{weather.condition}</span>
				</div>
				<p class="mt-[1.5vh] text-[3vh] text-neutral-400 tabular-nums">
					Feels {Math.round(weather.feelsLikeC)}&deg;
				</p>
				{#if headline}
					<p class="mt-[1.5vh] text-[3.5vh] text-amber-200/90">{headline}</p>
				{/if}
				{#if nextHours.length > 0}
					<ol class="mt-[4vh] flex gap-[2.5vw] text-neutral-400 tabular-nums">
						{#each nextHours as h (h.at.getTime())}
							<li class="flex flex-col items-center">
								<span class="text-[2.6vh]">{sydneyTimeCompact(h.at)}</span>
								<span class="text-[4.5vh] text-neutral-200">{Math.round(h.tempC)}&deg;</span>
								<span class="text-[2.4vh] {h.rainPct >= 50 ? 'text-sky-300' : 'text-neutral-500'}"
									>{h.rainPct}%</span
								>
							</li>
						{/each}
					</ol>
				{/if}
			{:else}
				<p class="text-[4vh] text-neutral-500">Weather unavailable</p>
			{/if}
		</section>
	</div>

	<div class="flex min-h-0 flex-col gap-[5vh]">
		<section>
			<h2 class="text-[2.6vh] font-semibold tracking-widest text-neutral-500 uppercase">Today</h2>
			{#if today.length === 0}
				<p class="mt-[1.5vh] text-[4vh] text-neutral-500">Nothing on the calendar</p>
			{:else}
				<ul class="mt-[1.5vh] space-y-[1.2vh]">
					{#each today.slice(0, MAX_EVENTS) as e (e.id)}
						<li class="flex items-baseline gap-[1.5vw] text-[4vh]">
							<span class="w-[9vw] shrink-0 text-[3.2vh] text-neutral-400 tabular-nums">
								{e.isAllDay ? 'All day' : sydneyTimeCompact(e.start)}
							</span>
							<span class="truncate text-neutral-200">{e.summary}</span>
						</li>
					{/each}
				</ul>
				{#if today.length > MAX_EVENTS}
					<p class="mt-[1vh] text-[2.8vh] text-neutral-500">
						+{today.length - MAX_EVENTS} more on the Calendar screen
					</p>
				{/if}
			{/if}
		</section>

		<section>
			<h2 class="text-[2.6vh] font-semibold tracking-widest text-neutral-500 uppercase">Buses</h2>
			{#if buses.length === 0}
				<p class="mt-[1.5vh] text-[4vh] text-neutral-500">No buses due</p>
			{:else}
				<div class="mt-[1.5vh] space-y-[2.5vh]">
					{#each buses as r (r.kids.join('+') + r.trip.label)}
						<div>
							<div class="text-[3vh] text-neutral-400">
								{r.kids.join(' & ')} · {r.trip.label}
							</div>
							<ul class="mt-[0.5vh] flex flex-wrap gap-x-[3vw] text-[4vh] tabular-nums">
								{#each r.departures as d (d.estimatedAt.getTime() + d.route)}
									<li class={d.cancelled ? 'text-neutral-600 line-through' : 'text-neutral-200'}>
										<span class="font-semibold">{d.route}</span>
										{sydneyTimeCompact(d.estimatedAt)}
										<span class="text-[3vh] text-neutral-400">{minsFromNow(d.estimatedAt)} min</span
										>
										{#if !d.realtime}<span class="text-[2.4vh] text-neutral-500">sched</span>{/if}
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			{/if}
		</section>
	</div>
</div>
