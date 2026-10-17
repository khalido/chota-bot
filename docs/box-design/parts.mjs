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
	{
		group: 'Core',
		item: 'Powerboard, 2 outlets, + IEC inlet or grommet',
		qty: 1,
		status: 'buy',
		aud: 25,
		source: 'Bunnings / Jaycar',
		why: 'one cord in; Pi and printer bricks plug in inside'
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
		item: '22→15-pin DSI ribbon for Pi 5',
		qty: 1,
		status: 'buy',
		aud: 8,
		source: 'Core Electronics',
		why: 'the panel has the older 15-pin socket'
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
		why: 'hears you; cancels its own voice; a USB sound card for speech. 16 kHz max, so music goes the other way'
	},
	{
		group: 'Voice + sound',
		item: 'Dayton Audio PC68-4, 2.5" full-range',
		qty: 2,
		status: 'buy',
		aud: 29,
		source: 'NB Audio (step up: ND65-4, ~A$60 each)',
		why: 'radio and podcasts while cooking; sealed boxes in the front wall, F3 ~120–150 Hz'
	},
	{
		group: 'Voice + sound',
		item: 'Stereo class-D amp, 5 V (TPA2012 or PAM8403)',
		qty: 1,
		status: 'buy',
		aud: 15,
		source: 'Core Electronics (Adafruit)',
		why: "fed from the Lite's 3.5 mm out; a ferrite on its power keeps hiss off the mics"
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
		item: 'USB audio adapter for music',
		qty: 1,
		status: 'later',
		aud: 15,
		why: 'full-quality music if the Lite’s 16 kHz sounds thin; mixed into the amp with two resistors, paused while TALK is held'
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
		item: 'JST-XH connector kit + crimper',
		qty: 1,
		status: 'buy',
		aud: 40,
		source: 'Jaycar / Amazon AU',
		why: 'Dupont loosens in a box that moves'
	},
	{
		group: 'Wiring',
		item: 'Soldering iron',
		qty: 1,
		status: 'buy',
		aud: 60,
		source: 'Jaycar',
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
