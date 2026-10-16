// Daily 03:30: drop `job_run` rows older than 30 days (~1k rows a day, mostly
// the 5-minute refreshes).
import { defineJob, pruneRuns } from '$lib/server/scheduler';

defineJob('job-runs-prune', '30 3 * * *', () => `${pruneRuns()} rows`);
