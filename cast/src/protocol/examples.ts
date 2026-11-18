// Sample screens, one per block plus a combined one and an HTML screen: the demo feeds them, the landing page shows
// them. Every name is invented. Times are relative to `now` so the demo always looks live.
import type { Block, Screen } from './schema.ts';

type Of<T extends Block['type']> = Extract<Block, { type: T }>;

const iso = (now: number, minutes: number) => new Date(now + minutes * 60_000).toISOString();
/** The top of the hour `h` hours from now. */
const onHour = (now: number, h: number) => {
	const d = new Date(now + h * 3_600_000);
	d.setMinutes(0, 0, 0);
	return d.toISOString();
};

const svg = (body: string) =>
	`data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;
const swatch = (a: string, b: string) =>
	svg(
		`<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="160" height="90" fill="url(#g)"/>`
	);

export function exampleScreens(now = Date.now()) {
	const weather: Of<'weather'> = {
		type: 'weather',
		place: 'Home',
		now: {
			tempC: 21.4,
			condition: 'Partly cloudy',
			feelsLikeC: 20,
			note: 'High 24° · Low 15° · Showers from 4 pm'
		},
		hours: [1, 2, 3, 4, 5, 6].map((h, i) => ({
			at: onHour(now, h),
			tempC: [22, 23, 24, 22, 19, 18][i],
			rainPct: [5, 10, 40, 70, 55, 20][i]
		}))
	};
	const calendar: Of<'calendar-day'> = {
		type: 'calendar-day',
		title: 'Today',
		events: [
			{ id: 'e0', title: 'Recycling out' },
			{
				id: 'e1',
				title: 'Swim lesson',
				start: iso(now, -95),
				end: iso(now, -50),
				where: 'Aquatic centre'
			},
			{
				id: 'e2',
				title: 'Video call with the grandparents',
				start: iso(now, -10),
				end: iso(now, 25)
			},
			{ id: 'e3', title: 'Piano', start: iso(now, 70), end: iso(now, 115), where: 'Music room' },
			{
				id: 'e4',
				title: 'Dinner with friends',
				start: iso(now, 240),
				where: 'Their place',
				who: 'Everyone'
			}
		]
	};
	const bus: Of<'bus'> = {
		type: 'bus',
		title: 'Buses',
		routes: [
			{
				route: '370',
				to: 'School',
				departures: [
					{ at: iso(now, 4.2), realtime: true },
					{ at: iso(now, 19), realtime: true },
					{ at: iso(now, 34) }
				]
			},
			{
				route: 'M30',
				to: 'City',
				departures: [
					{ at: iso(now, 7.5), realtime: true, cancelled: true },
					{ at: iso(now, 22.5), realtime: true },
					{ at: iso(now, 37.5) }
				]
			},
			{ route: '348', to: 'Beach', departures: [{ at: iso(now, 12.1) }, { at: iso(now, 42) }] }
		]
	};

	// The next seven days, from today in the TV's zone.
	const ymd = (d: Date) =>
		`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	const at = (days: number, hour: number, minute = 0) => {
		const d = new Date(now);
		d.setDate(d.getDate() + days);
		d.setHours(hour, minute, 0, 0);
		return d;
	};
	const plans: [string, number, string?][][] = [
		[
			['Swim lesson', 16, 'Aquatic centre'],
			['Video call with the grandparents', 18]
		],
		[
			['Dentist', 10, 'Main St'],
			['Bins out', 18]
		],
		[['Piano', 17, 'Music room']],
		[
			['Footy training', 16, 'Oval 2'],
			['Book club', 19]
		],
		[['Pizza night', 18]],
		[
			['Market', 9],
			['Birthday party', 13, 'The park'],
			['Movie', 19]
		],
		[]
	];
	const week: Of<'week'> = {
		type: 'week',
		days: plans.map((events, i) => ({
			date: ymd(at(i, 0)),
			events: events.map(([title, hour, where]) => ({
				title,
				start: at(i, hour).toISOString(),
				where
			}))
		}))
	};

	// The daily briefing, as chota lays it out: the day's calendar large, the clock beside it, then weather, buses,
	// chores and the school day along the bottom (a quote in that last cell after school hours).
	const briefing: Screen = {
		id: 'today',
		title: 'Today',
		columns: 4,
		rows: [3, 2],
		blocks: [
			{
				type: 'calendar-day',
				span: 3,
				title: 'Today',
				events: [
					{ id: 'b0', title: 'Library books due' },
					{ id: 'b1', title: 'School run', start: iso(now, -150), end: iso(now, -120) },
					{
						id: 'b2',
						title: 'Video call with the grandparents',
						start: iso(now, -15),
						end: iso(now, 20)
					},
					{
						id: 'b3',
						title: 'Swim lesson',
						start: iso(now, 55),
						end: iso(now, 100),
						where: 'Aquatic centre'
					},
					{ id: 'b4', title: 'Piano practice', start: iso(now, 130), end: iso(now, 160) },
					{ id: 'b5', title: 'Dinner with friends', start: iso(now, 240), where: 'Their place' }
				]
			},
			{ type: 'clock' },
			{
				type: 'weather',
				now: {
					tempC: 21.4,
					condition: 'Partly cloudy',
					note: 'High 24° · Showers from 4 pm',
					wear: 'Take an umbrella'
				},
				hours: [1, 2, 3, 4].map((h, i) => ({
					at: onHour(now, h),
					tempC: [22, 23, 21, 19][i],
					rainPct: [10, 40, 70, 30][i]
				}))
			},
			{
				type: 'bus',
				routes: [
					{
						route: '501',
						to: 'Town',
						departures: [{ at: iso(now, 6.2), realtime: true }, { at: iso(now, 18) }]
					},
					{
						route: 'M30',
						to: 'School',
						departures: [{ at: iso(now, 11.5), realtime: true }, { at: iso(now, 26) }]
					}
				]
			},
			{
				type: 'list',
				title: 'Chores',
				items: [
					{ id: 'c1', text: 'Feed the cat', meta: 'Kid1' },
					{ id: 'c2', text: 'Empty the dishwasher', meta: 'Kid2' },
					{ id: 'c3', text: 'Water the plants', meta: 'Parent1', done: true }
				]
			},
			{
				type: 'list',
				title: 'School · T4 Wk6',
				items: [
					{ text: '8:50am-3:10pm · Take sports stuff!', meta: 'Kid1' },
					{ text: '8:50am-3:10pm · Library day', meta: 'Kid2' }
				]
			}
		]
	};

	// Mock B: the morning by person. A strip along the top (clock, when to leave, weather, a fun line), then one
	// column per kid in their colour.
	const day = (d: number) => new Date(now + d * 86_400_000).toISOString().slice(0, 10);
	const kids: Screen = {
		id: 'kids',
		title: 'Morning',
		columns: 4,
		rows: [5, 8],
		blocks: [
			{ type: 'clock' },
			{
				type: 'leave',
				label: 'School bus',
				at: iso(now, 6.5),
				from: iso(now, -20),
				note: 'M30 to school'
			},
			{
				type: 'weather',
				now: {
					tempC: 17.6,
					condition: 'Showers',
					note: 'High 21° · Rain easing by 2 pm',
					wear: 'Umbrella and a jumper'
				},
				trace: Array.from({ length: 16 }, (_, i) => ({
					at: onHour(now, i - 3),
					tempC: [14, 14, 15, 16, 17, 18, 19, 20, 21, 21, 20, 19, 18, 17, 16, 15][i]
				}))
			},
			{
				type: 'text',
				title: 'Fact',
				text: 'A day on Venus is longer than its year: it spins once every 243 Earth days.'
			},
			{
				type: 'person',
				span: 2,
				name: 'Kid1',
				hours: { start: iso(now, 50), end: iso(now, 430) },
				nudge: 'Sports uniform: PE today',
				events: [
					{ id: 'k1a', title: 'Drop-off', start: iso(now, -3), end: iso(now, 0.2) },
					{ id: 'k1b', title: 'Football training', start: iso(now, 480), where: 'Oval' },
					{ id: 'k1c', title: 'Homework club', start: iso(now, 440), end: iso(now, 470) },
					{ id: 'k1d', title: 'Guitar', start: iso(now, 560) }
				],
				dates: [
					{ date: day(3), title: 'Year 9 camp' },
					{ date: day(8), title: 'Maths assessment' },
					{ date: day(15), title: 'Sports carnival' }
				],
				chores: [{ text: 'Bins out', done: true }, { text: 'Feed the cat' }, { text: 'Tidy room' }]
			},
			{
				type: 'person',
				span: 2,
				name: 'Kid2',
				hours: { start: iso(now, 50), end: iso(now, 430) },
				nudge: 'Library books back',
				events: [
					{ id: 'k2a', title: 'Piano', start: iso(now, 460), end: iso(now, 490) },
					{ id: 'k2b', title: 'Swim squad', start: iso(now, 520), where: 'Aquatic centre' }
				],
				dates: [
					{ date: day(1), title: 'Excursion: museum' },
					{ date: day(12), title: 'School concert' }
				],
				chores: [{ text: 'Empty the dishwasher' }]
			}
		]
	};

	const screens: Screen[] = [
		briefing,
		kids,
		{ id: 'clock', title: 'Clock', columns: 1, blocks: [{ type: 'clock' }] },
		{
			id: 'energy',
			title: 'Energy',
			columns: 3,
			blocks: [
				{
					type: 'stat',
					label: 'Solar now',
					value: 4.2,
					unit: 'kW',
					delta: '+0.6 kW in the last hour',
					tone: 'good'
				},
				{
					type: 'stat',
					label: 'House using',
					value: 1.8,
					unit: 'kW',
					delta: 'About usual',
					tone: 'neutral'
				},
				{
					type: 'stat',
					label: 'Price',
					value: 31,
					unit: 'c/kWh',
					delta: 'Spike from 5 pm',
					tone: 'bad',
					note: 'Run the dishwasher before then'
				}
			]
		},
		{
			id: 'shopping',
			title: 'Shopping',
			columns: 1,
			blocks: [
				{
					type: 'list',
					title: 'Shopping list',
					items: [
						{ text: 'Milk', meta: '2 L' },
						{ text: 'Bread', detail: 'Sourdough if they have it' },
						{ text: 'Apples', meta: '1 kg' },
						{ text: 'Dishwasher tablets' },
						{ text: 'Eggs', meta: 'dozen', done: true },
						{ text: 'Coffee beans', done: true }
					]
				}
			]
		},
		{
			id: 'watch',
			title: 'Watch',
			columns: 1,
			blocks: [
				{
					type: 'cards',
					title: 'On tonight',
					items: [
						{
							title: 'The Long Field',
							body: 'A farming family drama, season two.',
							meta: '7:30 pm',
							image: swatch('#3b4a3a', '#8a9a6b')
						},
						{
							title: 'Deep Water',
							body: 'Documentary on reef life.',
							meta: '8:30 pm',
							image: swatch('#1d3557', '#457b9d')
						},
						{
							title: 'Quiz Night',
							body: 'Live trivia.',
							meta: '9:15 pm',
							image: swatch('#5a3e5d', '#b5838d')
						}
					]
				}
			]
		},
		{
			id: 'notes',
			title: 'Notes',
			columns: 1,
			blocks: [
				{
					type: 'text',
					title: 'This week',
					text: '# School holidays start Friday\n\nPack lunches **Monday to Thursday** only. The library books are due back *Wednesday*.\n\n- Plumber comes Tuesday, 8–10 am\n- Bins: recycling this week\n- Wi-Fi password is on the fridge, not here'
				}
			]
		},
		{
			id: 'photo',
			title: 'Photo',
			columns: 1,
			blocks: [
				{
					type: 'image',
					src: svg(
						'<rect width="160" height="90" fill="#22303c"/><circle cx="120" cy="24" r="10" fill="#e9c46a" opacity=".8"/><path d="M0 90 L45 40 L80 72 L110 50 L160 90Z" fill="#2a9d8f" opacity=".7"/><path d="M0 90 L30 62 L70 90Z" fill="#264653"/>'
					),
					alt: 'Hills at dusk',
					caption: 'Hills at dusk, from last weekend'
				}
			]
		},
		{ id: 'weather', title: 'Weather', columns: 1, blocks: [weather] },
		{ id: 'calendar', title: 'Calendar', columns: 1, blocks: [calendar] },
		{ id: 'bus', title: 'Buses', columns: 1, blocks: [bus] },
		{ id: 'week', title: 'Week', columns: 1, blocks: [week] },
		{
			id: 'html',
			title: 'HTML',
			html: {
				html: '<style>.wrap{display:grid;place-items:center;height:100%;text-align:center}</style><div class="wrap"><div><h1>Your own HTML</h1><p>Sanitised, in a Shadow DOM: no scripts, no handlers, no frames.</p><p class="small">The sender\'s CSS can\'t reach the receiver.</p><img src="javascript:alert(1)" alt=""></div></div>',
				css: 'h1{font:300 4.5rem/1.1 system-ui,sans-serif;color:#d9d4c7;margin:0 0 1.5rem}p{font:400 2rem/1.4 system-ui,sans-serif;color:#9a958a;margin:.4rem 0}.small{font-size:1.5rem;color:#6f6b62}'
			}
		}
	];
	return screens;
}
