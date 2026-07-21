# Weather — design notes

How weather information is gathered, prioritized, and rendered across the kiosk's three surfaces.

## Philosophy

The kiosk is a **smart friend, not a weather station**. A glance should answer "what should I do differently today?", not "what's the dew point?". Three surfaces, three densities:

| Surface                   | Density           | What it shows                                      |
| ------------------------- | ----------------- | -------------------------------------------------- |
| **Print receipt**         | 1-2 lines         | Current temp + the one notable thing               |
| **Dashboard card**        | 4-5 lines         | Current + condition + headline + tiny lookahead    |
| **`/weather` fullscreen** | Whatever's useful | Current + 2-day grid + sparklines + sunrise/sunset |

The same `Weather` data powers all three. Render layers pick what to surface.

## Headline rules engine

`weatherSummary(weather, thresholds, now): string` returns the **one** most-actionable sentence. First match wins; thresholds tunable per family in `chota.config.ts`.

Order:

1. **Rain soon** — within `rainSoonMins` (default 120) and prob ≥ `rainPctSoon` (default 50)
   - `< 60 min`: `"Rain in ~30min (peaks 84%)."`
   - `≥ 60 min`: `"Rain by 4pm (84%)."`
2. **UV high** — current UV ≥ `uvHigh` (default 8) — Sydney sun is brutal for kids
   - `"UV 11 — sunscreen + hats."`
3. **Cold day** — today's max < `coldC` (default 12)
   - `"Cold today, peak 11°C — jackets on."`
4. **Hot day** — today's max > `hotC` (default 28)
   - `"Hot day, peaks 32°C — water + hats."`
5. **Windy** — current wind > `windyKmh` (default 30)
   - `"Windy, 35 km/h."`
6. **Default** — condition + today's range
   - `"Sunny, 14-22°C today."`

**Sydney-tuned defaults:**

```ts
{ coldC: 12, hotC: 28, windyKmh: 30, uvHigh: 8, rainPctSoon: 50, rainSoonMins: 120 }
```

A Brisbane fork might bump `coldC` to 15 + `hotC` to 32. A Boston fork would bump `coldC` to -5 and add a snow rule.

## ASCII mockups

### Dashboard card (small, ~280px wide)

Default:

```
┌─────────────────────────────────────┐
│ WEATHER                             │
│                                     │
│  16°  Clear                         │
│  Feels 16. UV 1 (low).              │
│                                     │
│  → Sunny all day, 14-22°C           │
└─────────────────────────────────────┘
```

With rain headline (priority 1):

```
┌─────────────────────────────────────┐
│ WEATHER                             │
│                                     │
│  16°  Clear                         │
│  Feels 16.                          │
│                                     │
│  → Rain by 4pm (84%) ☔             │
└─────────────────────────────────────┘
```

Click anywhere on card → `/weather`.

### `/weather` fullscreen

```
┌──────────────────────────────────────────────────────────────┐
│ Sydney                                  ↑ 06:25  ↓ 17:08     │
│                                                              │
│  16°   Clear                                                 │
│  Feels 16°    Wind ↑ 10 km/h    UV 1 low    Humidity 60%     │
│                                                              │
│  → Rain by 4pm tomorrow (peaks 84%)        ← headline        │
├──────────────────────────────────────────────────────────────┤
│              Morning      Noon       Evening     Night       │
│  Sat              —           —      Clear 17°   Clear 16°   │
│                                      0% rain     0% rain     │
│                                                              │
│  Sun         Sunny 16°  Sunny 19°    Clear 17°   Patchy 18°  │
│              0% rain    0% rain      0% rain     66% rain    │
│                                                              │
│  Mon         Patchy 17° Patchy 20°   Patchy 19°  Patchy 19°  │
│              84% rain   68% rain     100% rain   63% rain    │
├──────────────────────────────────────────────────────────────┤
│  Next 12h temp                                               │
│  ▁▂▃▅▆▇█▇▆▅▃▂                                                │
│                                                              │
│  Next 12h rain                                               │
│  ▁▁▁▂▄▆█▆▄▂▁▁                                                │
└──────────────────────────────────────────────────────────────┘
```

Sparklines via inline SVG (no chart lib). Block-cell colors: yellow for sun, gray for cloud, blue for rain.

### Print receipt

```
-- WEATHER --
  16C, Clear. Feels 16C.
  Rain by 4pm (84%).
```

Two lines max. ASCII only. Headline is the second line.

## Color cues

For the dashboard card and `/weather` page (not the receipt):

| Condition         | Tailwind palette | Reason  |
| ----------------- | ---------------- | ------- |
| Clear / Sunny     | amber-*          | Warm    |
| Cloudy / Overcast | slate-*          | Neutral |
| Rain / Showers    | sky-* / blue-*   | Wet     |
| Storm             | indigo-*         | Severe  |
| Snow              | (n/a Sydney)     | —       |

## Data shape

```ts
interface Weather {
	tempC: number;
	feelsLikeC: number;
	condition: string; // "Sunny", "Patchy rain near", etc.
	humidityPct: number;
	windKmh: number;
	uvIndex: number;
	// sunrise / sunset — Google's currentConditions.sunEvents has these; not surfaced
	// on Weather yet. Add when /weather wants to dim past blocks against actual
	// sunset rather than the (current) Sydney-time approximation.
	hourly: ForecastHour[]; // up to 48
}

interface ForecastHour {
	at: Date;
	tempC: number;
	condition: string;
	rainPct: number;
	rainMm: number;
	windKmh: number;
}
```

Pure helpers (all in `src/lib/server/tools/weather.ts`):

- `findRainSoon(hourly, now, threshold) → RainSoon | null`
- `groupByDayBlocks(hourly) → DayBlock[]`
- `groupByDay(blocks) → DayForecast[]` — re-groups into per-day rows for the grid
- `weatherSummary(weather, thresholds, now) → string`

## Sea — the beach report (folded into weather)

Weather is **sky + sea**. `tools/beach.ts` parses the [Randwick City Council
lifeguard RSS feed](https://www.randwick.nsw.gov.au/integration/feeds/lifeguard-reports)
for the configured beach (`chota.config.ts > home.beach.name`, e.g. Coogee) into
a `BeachReport` (summary, water temp, wave height, rips, bluebottles, status,
`updated`). It's surfaced **through weather**, not as its own subsystem:

- **Print:** `beachSummary()` (sibling to `weatherSummary()`) renders one line —
  `Coogee: rough conditions, 18C water, 2m waves, open (rips: be cautious)` — into
  the WEATHER section of **every morning** brief (thermal-safe: bare "C", no ° glyph).
- **Agent:** the `weather` agent tool returns the **full** `BeachReport`, so it can
  answer "how cold's the water?" / "any bluebottles?" — not just the one-liner.
- **Refresh:** the `weather-refresh` job (every 30 min) warms the beach cache on the
  same tick — one "weather" thing to refresh. `beach.ts` keeps its own 30-min TTL,
  so the RSS is fetched at most once per run.

Why it lives here and not in its own file/section: the fetch mechanics differ
(Google JSON API vs council RSS + cheerio), so `beach.ts` stays a separate source
module — but it's _composed at the weather surface_ everywhere a caller touches it.
Randwick-council beaches only for now (that's the one feed we parse).

Both caches (weather + bus) now carry a **staleness guard**: if the refresh job has
been failing for hours (weather >3h, bus >1h), a read re-fetches rather than serving
an ancient forecast, and degrades to "unavailable" if that fetch also fails. Pure
safety net — the refresh jobs keep caches far inside the window in normal operation.

## What's deferred (open for later)

- **`forecast/days` endpoint** for day-3+ outlook (we use 48h hourly today, which gives today + tomorrow only)
- **Daily forecast cards** (the 7-day mini grid Aniqa uses)
- **Air quality** (different API — OpenAQ or BoM)
- **Sydney severe-weather alerts** from BoM (separate API; Google `publicAlerts` is unreliable in Australia)
- **Per-hour wind direction arrows** on the sparkline
- **Other cities** (single-kiosk, single-location)
- **Real serif font** via [Fontsource](https://fontsource.org/docs/guides/svelte) — the literary clock currently uses Tailwind's `font-serif` which falls back to system serifs (Georgia/Times). A loaded serif (Lora, Playfair Display, Crimson Pro) would polish the `/clock` and `/weather` headlines significantly. Trade-off: ~30-50KB woff2 per weight, one-time CSS import.

## References (designs that influenced this)

- `wttr.in` — text-based 3-day grid with condition + temp + wind + precip per time block. Closest to our ambient aesthetic.
- Wunderground 10-day chart view — too information-dense; useful as a reference for what NOT to put on a kiosk.
- Aniqa's Weather Dashboard (Dribbble-style) — "Umbrella Required" hint matches our headline pattern exactly.
- Isabella's Weather Dashboard — SVG hourly sparkline + categorical UV labels worth borrowing.
