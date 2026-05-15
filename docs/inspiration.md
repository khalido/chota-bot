# Inspiration

Visual + functional references for Chota. Links + notes mostly. Public/sharable images can sit alongside this doc in `docs/inspiration/`. Anything copyrighted, personal, or that we'd rather not redistribute goes in `docs/private/inspiration/` (gitignored).

## Receipt designs

### GUS — daily briefing receipt

Source: [@thisischristina on X](https://x.com/thisischristina/status/2051997062170890431)

**What to steal:**
- **Numbered sections** (`01 MESSAGE`, `02 TODAY`, `03 WEATHER`, `04 STOCKS`, `05 WORD`, `06 JOKE`) — feels structured + scannable. Translates well to thermal printer.
- **Section IDs** in monospace right-margin (`MES-8B4F6B`, `WEA-3F7B5B`) — fake "receipt" feel. Could generate random per-day for novelty.
- **Big section labels** like `[CLOUDY]` for the headline — much louder than our current `-- WEATHER --`. Consider for the print receipt.
- **Sparklines for time-series data** (stocks line graph). Same SVG-sparkline pattern works for our hourly temp / rain forecast on the dashboard `/weather` page (already in `docs/weather.md` as deferred). For the print receipt: dithered ASCII-art sparkline (`▁▂▃▅▆▇█`) renders cleanly on thermal.
- **Dithered icons** for weather / sections — the GUS cloud is a 1-bit dither pattern. We already plan ESC/POS dithering for the printer; a small library of icons (sunny / cloudy / rain) is a future polish.
- **Date prominent at top** — we already have this. Good confirmation.
- **Sunrise / sunset / rain block** in the weather section — small stats grid, clearly delineated.

**What NOT to steal:**
- Stocks. Not relevant for a family kiosk.
- The QR-style decorative dot grid in the header. Looks cool but adds nothing.

## Daily content sections — brainstorm

User idea: receipt has rotating "interesting" sections beyond data. **Pattern: 5 possible sections, randomly pick 2 each day** so the receipt stays varied + bounded length. Deterministic per-Sydney-date so a reprint shows the same picks.

```
SECTIONS = ['joke', 'fact', 'math', 'word', 'photo', 'news']
todayKey = sydneyYMD(now)
todaySections = pickN(SECTIONS, 2, seed=hash(todayKey))
```

Some sections (like `news`) might also appear on the dashboard *and* the receipt — they're not mutually exclusive surfaces. The rotating-pick logic just decides what makes it to the *receipt* on a given day.

### Joke of the day (kid-friendly)

| Source | Pros | Cons | Verdict |
|---|---|---|---|
| **Local JSON** (~100 hand-curated) | Predictable, controllable | Effort to curate | Best for kid-appropriate baseline |
| [icanhazdadjoke.com](https://icanhazdadjoke.com) free API | Free, ~600 jokes, mostly safe | Rare adult slip-throughs | Good fallback / mix |
| [jokeapi.dev](https://jokeapi.dev) | Has `safe-mode` filter | Variable quality | Backup |
| LLM (Haiku via Gateway) | Infinite, kid-tuned via prompt | Variable quality, occasional misfire | Fallback when local pool exhausted |

**Recommendation:** Local JSON of 100 jokes (curate over time) + LLM fallback when running low.

### Science fact of the day

| Source | Pros | Cons | Verdict |
|---|---|---|---|
| [NASA APOD](https://apod.nasa.gov/apod/) | Daily, free, kid-fascinating, image-driven | Astronomy only | Best single source |
| [Wikipedia "On this day"](https://en.wikipedia.org/wiki/Wikipedia:Selected_anniversaries) | Free, real history, varied | Sometimes mature events | Filter at LLM step |
| Local JSON of facts | Curated, on-brand | Effort | Long-term play |
| LLM-generated | Infinite, kid-tuned | Quality risk, "LLM busywork" feel | Use sparingly, maybe one Haiku per day with a tight prompt |

**Recommendation:** Mix — NASA APOD on weekdays (image + caption); Wikipedia "on this day" filtered through Haiku for kid-appropriate framing on weekends.

### Math puzzle / fact

| Source | Pros | Cons | Verdict |
|---|---|---|---|
| **Local JSON** (~50 puzzles by age) | Reliable, age-tuned per kid | Curation effort | Best |
| LLM-generated with verification | Infinite, can target each kid | Risk of broken puzzles, needs second LLM call to verify | Fallback |
| [Project Euler](https://projecteuler.net) | Established | Way too hard for kids | Skip |

**Recommendation:** Curate 50 age-appropriate puzzles in JSON. Print 1 per kid, rotate. Solutions on a separate "answer" reprint? Or just include upside-down at the bottom.

### Word of the day (vocabulary)

| Source | Pros | Cons | Verdict |
|---|---|---|---|
| [Wordnik API](https://developer.wordnik.com) | Free tier, has WOTD endpoint | Sometimes too obscure | Try first |
| [Wiktionary](https://en.wiktionary.org) | Free, comprehensive | No daily endpoint, need scraping | Skip |
| Local JSON | Curated by reading level | Effort | Long-term |

**Recommendation:** Wordnik first; fallback to local JSON. Filter for kid-appropriate length + meaning.

### News (kid-friendly, RSS-driven)

User idea: small news section on dashboard + print receipt. Pull from a mix of RSS feeds, run through Haiku to rewrite as 2-3 kid-friendly short lines. **Not a marquee ticker** — those distract; static section that updates on dashboard load is calmer.

| Source | Notes |
|---|---|
| [BBC Newsround](https://www.bbc.co.uk/newsround) | RSS available; already kid-focused, light pre-processing needed. **Best primary source.** |
| [National Geographic Kids](https://kids.nationalgeographic.com) | Animal + science focus; check if RSS exists or scrape |
| [Science News for Students](https://www.snexplores.org) | Has feed; teen-focused but interesting |
| BBC News (general) science feed | Adult source; needs heavier kid-rewrite |
| The Guardian science RSS | Same |
| NASA News | Space-flavoured, easy to make exciting |

**LLM rewrite pattern:** Haiku via Gateway — pass top 5-10 article titles + summaries from a mix of feeds, prompt: *"Pick 2-3 most family-interesting. Rewrite each as one sentence in simple words a 10-year-old understands. No politics, no violence, no scary stuff. Bias toward science / discovery / animals."*

**Print form:**
```
-- NEWS --
  - NASA's new Mars rover found weird purple rocks.
  - A new octopus was discovered near Antarctica.
```

**Dashboard form:** small `News` card, 2-3 bullet lines, refresh on each load. Same data feeds the print receipt.

**Implementation when built:**
- `npm i rss-parser` (already noted in plan.md as deferred)
- Feed list lives in `chota.config.ts` (so forks can use local feeds)
- `getNews(opts?)` tool: fetches all feeds in parallel, dedupes, returns top N raw items
- `summarizeNews(items)` helper: calls Haiku with the prompt, returns `{ kidLine: string }[]`
- Cache the LLM output for ~6h so dashboard refreshes don't burn tokens

### Photo of the day (Google Photos memories)

User idea: random pic from older Google Photos library, LLM caption ("On this day 2 years ago — Blue Mountains hike"). v1 had a Python `gen_image.py` with a safety-gate + warm-style suffix pattern worth preserving (see `docs/audit-2026-05.md` §"Ideas Worth Salvaging").

| Source | Notes |
|---|---|
| Google Photos API | Requires OAuth (same project as Calendar). `mediaItems.search` with date range to find "on this day". |
| LLM caption | Gemini Flash (cheap, multimodal via AI Gateway) — pass image bytes, ask for one warm-tone sentence. |
| Print path | Need 1-bit dither at appropriate size for the printer (`sharp` for resize + dither). Caption text below. |

**Defer until:** the agent loop ships (Google OAuth is already wired via better-auth). High-effort feature; high-emotion payoff.

## Calendar — connecting Google Calendar

Plan §"Auth & Google integrations" already covers the OAuth flow. Specific to this brainstorm:

- **Today section** of the print receipt should show calendar events for *today* (event titles only, ASCII):
  ```
  -- TODAY --
    08:00  Kid1 school
    16:00  Kid2 swim
    18:30  Family dinner
  ```
- **Imminent flag**: an event within ~60 min could get a `*` prefix.
- **Tomorrow lookahead** (in the agent's closing OR a separate section): "Tomorrow: Kid2 excursion — pack lunch + closed shoes" — joins to `activities` config in `chota.config.ts` for gear hints.

### Implementation notes

Built — see `src/lib/server/tools/calendar.ts`. Uses `googleapis` + better-auth's Google OAuth (no manual `scripts/google-auth.mjs` token dance). Calendar ID lives in `chota.config.ts > calendar.id`. Filters to that one calendar; multiple-calendar support is a future option.

## Other patterns worth noting

- **Big bold section header** (GUS uses `[ CLOUDY ]` style). Could lift our headline to:
  ```
  -- WEATHER --
    [ CLOUDY ]
    16C, feels 16C. Rain by 4pm (84%).
  ```
- **Right-margin annotations** (GUS section IDs). Cute but optional. Could randomly stamp section IDs for visual rhythm.
- **Sparkline in print** — temp/rain hourly trend rendered as `▁▂▃▅▆▇█` Unicode blocks. Note: not ASCII, so the plain-text path can't use them; only the HTML→image path. Thermal printer renders the rastered version cleanly.

## Where to add this stuff

When ideas here become real:
- New tools → `tools.md` (Future ideas section)
- Print format additions → `plan.md` §Print formats
- Visual design → `weather.md` (or new per-feature design doc)
- Schema changes → `chota.config.ts` types in `src/lib/config.ts`

This file stays as the unfiltered idea pile.
