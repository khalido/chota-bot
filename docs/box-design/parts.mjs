// The electronics and printer that go in the box: what's on hand, what to buy.
// Prices are AUD, approximate (the source named); "have" rows carry no price.
// The box's own fittings (hinges, magnets, feet) are `hardware` in box.mjs.

export const equipment = [
	// core
	{
		group: 'Core',
		item: 'Raspberry Pi 5 4GB + Active Cooler',
		qty: 1,
		status: 'have',
		why: 'runs everything: server, agent, kiosk'
	},
	{
		group: 'Core',
		item: 'Official 27 W USB-C power supply',
		qty: 1,
		status: 'have',
		why: 'Pi power'
	},
	{
		group: 'Core',
		item: 'microSD, A2, 32–64 GB',
		qty: 1,
		status: 'buy',
		aud: 20,
		source: 'Core Electronics',
		why: "the Pi won't boot without it"
	},
	{
		group: 'Core',
		item: 'MUNBYN ITPP098P 80 mm thermal printer',
		qty: 1,
		status: 'have',
		why: 'the point of the box; measure it before cutting wood'
	},
	{
		group: 'Core',
		item: 'MUNBYN 80 × 80 mm BPA-free paper rolls',
		qty: 10,
		status: 'have',
		why: 'near the printer’s largest roll'
	},

	// screen and camera
	{
		group: 'Screen + camera',
		item: 'Waveshare 10.1" DSI LCD (C), 1280×800',
		qty: 1,
		status: 'buy',
		aud: 130,
		source: 'Core Electronics',
		why: 'the lid screen; dimmable from software'
	},
	{
		group: 'Screen + camera',
		item: 'DSI cable for Pi 5, 22-pin, 300–500 mm',
		qty: 1,
		status: 'buy',
		aud: 8,
		source: 'Core Electronics (match the panel end; the official Pi display cable comes in 500 mm)',
		why: 'the Pi sits on the floor, so the 12–20 cm cable in the box is too short; bench-test the long one'
	},
	{
		group: 'Screen + camera',
		item: 'Pi Camera Module 3 (standard)',
		qty: 1,
		status: 'buy',
		aud: 50,
		source: 'Core Electronics',
		why: 'reads a flyer held up; autofocus up close'
	},
	{
		group: 'Screen + camera',
		item: 'Pi 5 camera ribbon, 300 mm',
		qty: 1,
		status: 'buy',
		aud: 5,
		source: 'Core Electronics',
		why: 'the Pi 5 needs the narrow 22-pin end'
	},

	// audio
	{
		group: 'Voice + sound',
		item: 'Seeed ReSpeaker Lite (2-mic, XU316, USB)',
		qty: 1,
		status: 'buy',
		aud: 43,
		source: 'Core Electronics (bare board, not the A$85 kit)',
		why: 'hears you, behind the front rim. In v1 it only listens; TALK pauses all sound, so echo is no problem'
	},
	{
		group: 'Voice + sound',
		item: 'Momentary push button, ~22 mm brass (TALK)',
		qty: 1,
		status: 'buy',
		aud: 8,
		source: 'Jaycar',
		why: 'hold: the box goes quiet and listens; wired to the Pico'
	},
	{
		group: 'Voice + sound',
		item: 'Dayton Audio ND91-8, 3.5" full-range',
		qty: 2,
		status: 'buy',
		aud: 70,
		source: 'NB Audio / Soundlabs: price not confirmed, ask',
		why: 'near-Nest sound: 5 mm cone travel, one ~1.9 L sealed chamber for the pair, bass EQ on the Pi'
	},
	{
		group: 'Voice + sound',
		item: 'TPA3116 2 × 50 W amp board',
		qty: 1,
		status: 'buy',
		aud: 30,
		source: 'Altronics / Jaycar / Amazon AU',
		why: 'the ND91s are 82 dB/2.83 V and the bass EQ eats headroom; runs on 12–24 V'
	},
	{
		group: 'Voice + sound',
		item: '24 V 5 A brick + DC Y-splitter + 2200 µF capacitor',
		qty: 1,
		status: 'buy',
		aud: 55,
		source: 'Jaycar / Altronics (match the printer’s DC plug)',
		why: "outside the box, one lead in: feeds the printer and the amp, and retires the printer's own brick. The capacitor sits at the amp. If prints tick in the music, give the amp its own 24 V 3 A pack (A$35)"
	},
	{
		group: 'Voice + sound',
		item: 'USB sound card (stereo out)',
		qty: 1,
		status: 'buy',
		aud: 15,
		source: 'Core Electronics / Jaycar',
		why: 'all playback, full quality; the Lite tops out at 16 kHz'
	},

	// controls
	{
		group: 'Controls',
		item: 'Raspberry Pi Pico 2 WH',
		qty: 1,
		status: 'have',
		why: 'reads every dial, switch and button; one USB cable to the Pi'
	},
	{
		group: 'Controls',
		item: '10k linear panel pots, ¼" shaft',
		qty: 2,
		status: 'have',
		why: 'WHO and WHAT dials'
	},
	{
		group: 'Controls',
		item: 'Rotary encoder with button',
		qty: 1,
		status: 'have',
		why: 'bake-off against the pots'
	},
	{
		group: 'Controls',
		item: 'Mini SPDT toggles + 1 chunky SPST',
		qty: 4,
		status: 'have',
		why: 'deck toggles; the chunky one under a cover'
	},
	{ group: 'Controls', item: '30 mm red LED arcade button', qty: 1, status: 'have', why: 'PRINT' },
	{ group: 'Controls', item: '10 mm diffused LEDs', qty: 25, status: 'have', why: 'status lights' },
	{
		group: 'Controls',
		item: '220–470 Ω resistor assortment',
		qty: 1,
		status: 'buy',
		aud: 8,
		source: 'Jaycar',
		why: 'one per LED'
	},
	{
		group: 'Controls',
		item: 'Analog panel meter, 0–1 mA',
		qty: 1,
		status: 'buy',
		aud: 15,
		source: 'Jaycar / Altronics',
		why: 'needle meter: minutes to the bus'
	},

	// build
	{
		group: 'Wiring',
		item: 'JST-XH pre-crimped leads + housings',
		qty: 1,
		status: 'buy',
		aud: 40,
		source: 'Jaycar / Amazon AU',
		why: 'Dupont loosens in a box that moves'
	},
	{
		group: 'Wiring',
		item: 'Right-angle USB-A and USB-C adapters',
		qty: 3,
		status: 'buy',
		aud: 4,
		source: 'Amazon AU',
		why: 'the plugs on the Pi face the back wall with 45 mm to spare'
	},
	{
		group: 'Wiring',
		item: 'Soldering iron (Pinecil-class USB-C)',
		qty: 1,
		status: 'buy',
		aud: 45,
		source: 'Core Electronics',
		why: 'pots, LEDs, meter, amp'
	},
	{
		group: 'Wiring',
		item: 'Brass M2.5 standoffs, breadboard, jumpers',
		qty: 1,
		status: 'have',
		why: 'mounting and testing'
	},

	// later
	{
		group: 'Later',
		item: 'Missile-switch cover',
		qty: 1,
		status: 'later',
		aud: 10,
		why: 'for the chunky toggle'
	},
	{
		group: 'Later',
		item: 'LD2410 mmWave sensor',
		qty: 1,
		status: 'later',
		aud: 10,
		why: 'wake the screen when someone walks up'
	}
];

/** Sum of the "buy" rows, price × qty. */
export const toBuy = () =>
	equipment.filter((e) => e.status === 'buy').reduce((n, e) => n + (e.aud ?? 0) * e.qty, 0);
