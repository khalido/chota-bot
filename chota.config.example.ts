/**
 * Chota config — committed example.
 *
 * Copy this file to `chota.config.ts` (gitignored) and fill in real values.
 * The dev server won't start without `chota.config.ts` present.
 *
 *   cp chota.config.example.ts chota.config.ts
 *
 * Edit chota.config.ts to match your family. Types come from src/lib/config.ts.
 */
import { defineChota } from './src/lib/config';

export default defineChota({
	// People the bot recognises in calendar event titles. `aliases` are matched
	// case-insensitively (nicknames, initials). Used to tag events on the print.
	family: [
		{ name: 'Parent1', aliases: ['Parent1', 'P1'] },
		{ name: 'Parent2', aliases: ['Parent2', 'P2'] },
		{ name: 'Kid1', aliases: ['Kid1', 'K1'] },
		{ name: 'Kid2', aliases: ['Kid2', 'K2'] },
		{ name: 'Kid3', aliases: ['Kid3', 'K3'] }
	],
	kids: [
		{
			name: 'Kid1',
			buses: [{ label: 'school', stop: '0000000', routes: ['123'], targetTime: '08:00' }]
		},
		{
			name: 'Kid2',
			buses: [{ label: 'school', stop: '0000000', routes: ['123', '456'], targetTime: '08:00' }]
		},
		{
			name: 'Kid3',
			buses: []
		}
	],
	chores: {
		definitions: {
			dish: 'Empty + load the dishwasher',
			dog: 'Walk and feed the dog'
		},
		rotation: {
			Mon: { dish: 'Kid1', dog: 'Kid3' },
			Tue: { dish: 'Kid3', dog: 'Kid2' },
			Wed: { dish: 'Kid2', dog: 'Kid1' },
			Thu: { dish: 'Kid1', dog: 'Kid2' },
			Fri: { dish: 'Kid3', dog: 'Kid1' },
			Sat: { dish: 'Kid1', dog: 'Kid2' },
			Sun: { dish: 'Kid2', dog: 'Kid3' }
		}
	},
	home: { suburb: 'Sydney', lat: -33.86, lon: 151.18 },
	school: { region: 'NSW' },
	// Google Calendar to read for the family schedule. List your calendar IDs
	// from /admin (after signing in with Google), paste the right one here.
	calendar: { id: 'your-family-calendar-id@group.calendar.google.com' },
	ticktick: {
		// internal name → exact TickTick list name. Only lists mapped here are
		// visible to the bot; private lists stay invisible. Adjust to your setup —
		// these are the names the chota-bot reference family uses:
		lists: {
			buying: 'Buying', // longer-term wishlist (shoes, gear, "someday" stuff)
			read: 'Read', // books, articles, links to share with the family
			watch: 'Watch', // TV, movies, YouTube — things to watch together
			shopping: 'Shopping', // everyday items / groceries — shown in full on the morning print
			notes: 'Notes' // general family notes
		}
	},
	// Thermal printer (MUNBYN ITPP098P or similar 80mm ESC/POS). Vendor/product
	// IDs from `lsusb` / `system_profiler SPUSBDataType`. Column width is set in
	// code (Font A ≈ 46 cols on an 80mm head); the "test" print's ruler confirms.
	printer: { vendorId: 0x0483, productId: 0x5743 }
});
