// Dreaming — daily 03:00 Sydney. STUB: returns a no-op string until the agent
// runtime + memory tool land. Kept registered so the cron entry exists and
// /admin/jobs shows it as a known scheduled slot. When implemented (see
// docs/agent.md §Memory tool + §Sessions), this will read simplified session
// logs + family.jsonl, consolidate via Sonnet, write family.jsonl.new, then
// atomic-rename — Anthropic Dreams pattern (input never modified).
import { defineJob } from '$lib/server/scheduler';

defineJob('dreaming', '0 3 * * *', () => 'stub — agent runtime + memory tool pending');
