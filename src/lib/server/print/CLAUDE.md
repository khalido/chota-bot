# print/

The daily-brief → thermal-print pipeline, in four stages:

1. **Gather** — `brief.ts > gatherBrief({ day })` pulls every tool into one
   `BriefData` blob; each tool failure degrades to null/[] so one dead tool
   never sinks the brief. `day: 'tomorrow'` shifts the whole brief one day
   ahead — that's the only difference between the morning and evening prints.
2. **Model** — `sections.ts` turns `BriefData` into a renderer-agnostic
   `PrintSection[]`. `recipientToSections(who, …)` picks what one person sees.
3. **Render** — three renderers consume that model:
   - `sections.ts > sectionsToText()` — plain ASCII (browser preview + text printing)
   - `<BriefSheet>` (`lib/components/print/`) — the styled `/print/<who>` HTML page
   - `render.ts` — server-side canvas, the fallback when the screenshot path is down
4. **Output** — `snapshot.ts` screenshots `/print/<who>` → PNG; `printer.ts`
   drives the USB thermal printer.

`composers.ts` orchestrates — `composeText`/`composeImage` per "kind"; it's the
entry point routes and jobs import. `weather-block.ts` is weather *formatting*
(the data/cache layer is `tools/weather.ts`). `wrap.ts` is shared text wrapping.

Every recipient is one family member from `chota.config.ts` — there is no
generic "family" sheet. A kid's brief gains a SCHOOL section; everyone else's
is just the household sections.
