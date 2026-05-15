// Heartbeat — returns "alive" every 5 min. Pure scheduler smoke test: confirms
// the cron tick is firing + HMR-safe reloads work in dev. Visible at /admin/jobs.
// Stub-style scaffolding; drop the file if the ring-buffer noise becomes annoying.
import { defineJob } from '$lib/server/scheduler';

defineJob('heartbeat', '*/5 * * * *', () => 'alive');
