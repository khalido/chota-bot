/**
 * /admin/sentral — per-kid Sentral debug. Surfaces what's on disk + lets
 * you trigger a refresh without waiting for the cron.
 *
 * For each kid configured via SENTRAL_<NAME>_* env, returns the
 * .ics + cookie file state (exists / mtime / event count) so a quick
 * eyeball tells you whether `refreshTimetable` is needed. The page
 * itself has a button per kid that POSTs to /api/admin/sentral/refresh.
 */
import { stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { configuredSentralKids, getSchedule, parseIcsEvents } from '$lib/server/tools/sentral';
import type { PageServerLoad } from './$types';

export interface SentralKidStatus {
	who: string;
	ics: { exists: boolean; mtime?: string; events?: number; todayPeriods?: number; bytes?: number };
	cookie: { exists: boolean; mtime?: string; bytes?: number };
}

async function fileInfo(path: string) {
	try {
		const s = await stat(path);
		return { exists: true, mtime: s.mtime.toISOString(), bytes: s.size };
	} catch {
		return { exists: false };
	}
}

export const load: PageServerLoad = async () => {
	const kids = configuredSentralKids();
	const dir = join(process.cwd(), 'data', 'sentral');
	const status = await Promise.all(
		kids.map(async (who): Promise<SentralKidStatus> => {
			const icsPath = join(dir, `${who}-timetable.ics`);
			const cookiePath = join(dir, `${who}-cookie.txt`);
			const ics = await fileInfo(icsPath);
			const cookie = await fileInfo(cookiePath);
			let events: number | undefined;
			let todayPeriods: number | undefined;
			if (ics.exists) {
				const text = await readFile(icsPath, 'utf8').catch(() => '');
				events = parseIcsEvents(text).length;
				todayPeriods = (await getSchedule(who)).length;
			}
			return { who, ics: { ...ics, events, todayPeriods }, cookie };
		})
	);
	return { kids: status };
};
