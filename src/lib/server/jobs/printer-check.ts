// Every 15 min: ask the thermal printer how it is (connected, paper in, cover
// shut) and alert on the default channel when it can't print; "back to normal"
// after two good checks. Uses no paper. Skips a tick while a print is running.
// Kiosk only. Runs at :05, :20, :35, :50 so it never lands on a print's slot.
import { defineJob } from '#lib/server/scheduler.ts';
import { clearAlert, raiseAlert } from '#lib/server/alerts.ts';
import { getConfig } from '#lib/server/config.ts';
import { readPrinterStatus } from '#lib/server/print/printer.ts';
import { KIOSK } from '$app/env/private';

defineJob(
	'printer-check',
	'5-59/15 * * * *',
	async () => {
		if (KIOSK !== 'true') return 'skipped (KIOSK env not set)';
		if (!getConfig().printer) return 'skipped (no printer in config)';
		const status = await readPrinterStatus();
		if (!status) return 'skipped (printing)';

		// Two keys: a low roll opened first must not mute "paper out" later.
		if (status.ok)
			await clearAlert('printer', { okNeeded: 2, recovered: 'Printer is working again' });
		else await raiseAlert('printer', `Printer: ${status.problems.join(', ')}`);
		if (status.paperLow) await raiseAlert('printer:paper-low', 'Printer: paper is running low');
		else if (status.ok)
			await clearAlert('printer:paper-low', { okNeeded: 2, recovered: 'Printer has paper again' });

		const low = status.paperLow ? ' (paper low)' : '';
		return status.ok
			? low
				? `ok${low}`
				: undefined
			: `${status.problems.join(', ')} [${status.raw}]`;
	},
	{ logOk: false }
);
