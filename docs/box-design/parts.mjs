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
		item: 'Waveshare 8" DSI LCD (C), 1280×800, 194 × 119 mm',
		qty: 1,
		status: 'buy',
		aud: 125,
		source: 'Waveshare US$79 (AU stockist and price not checked)',
		why: 'the lid screen: toughened, optically bonded glass, so it sits flush in the wood like a tablet, not a bezelled monitor; dimmable from software (0–255 in sysfs). Remove its Pi-mounting standoffs: the lid has ~9 mm behind the glass'
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
		why: 'reads a flyer held up; autofocus up close. Behind a clear spot in the eye window'
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

	{
		group: 'Screen + camera',
		item: 'Waveshare 4.2" e-ink module, 400 × 300, black/white/red (WS-13454)',
		qty: 1,
		status: 'buy',
		aud: 58,
		source: 'Core Electronics (supplier stock, ~1–2 weeks)',
		why: 'on the printer lid: the day, readable with the box shut, no power between updates; 103 × 78.5 board fits behind the slot. Bare SPI module on an 8-wire cable to the Pi’s pins; check its Pi 5 GPIO support'
	},
	{
		group: 'Screen + camera',
		item: 'Waveshare 2.42" OLED, 128 × 64 (yellow "(C)" if stocked)',
		qty: 1,
		status: 'buy',
		aud: 24,
		source: 'Core Electronics / Little Bird',
		why: 'on the deck by PRINT: what chota is doing. Run by the Pico'
	},
	{
		group: 'Screen + camera',
		item: '1.3" OLED, 128 × 64, I2C (yellow if stocked)',
		qty: 2,
		status: 'buy',
		source: 'Core Electronics: price not checked',
		why: 'behind WHO and WHAT: what each dial is set to, the instant it turns'
	},
	{
		group: 'Screen + camera',
		item: 'GlowBit Matrix 8×8 (CE08033), WS2812B, 61 mm square',
		qty: 1,
		status: 'buy',
		aud: 17,
		source: 'Core Electronics (in stock)',
		why: "the face, in the eye window over the printer: wake, listening, thinking, talking. The Pi drives it from one GPIO through Adafruit's Pi 5 PIO NeoPixel library (young; fallback: the Pico drives it)"
	},
	{
		group: 'Screen + camera',
		item: '74AHCT125 level shifter + 24 V → 5 V 3 A buck module',
		qty: 1,
		status: 'buy',
		source: 'Core Electronics / Jaycar: price not checked',
		why: "the LEDs want 5 V data and their own 5 V, off the 24 V lead rather than the Pi's supply"
	},
	{
		group: 'Screen + camera',
		item: 'Smoked acrylic, 2–3 mm offcut',
		qty: 1,
		status: 'buy',
		aud: 10,
		source: 'Bunnings / a plastics shop',
		why: 'the eye window and the OLED windows: black until lit'
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
		item: 'Momentary push button, 16–19 mm brass, short body (TALK)',
		qty: 1,
		status: 'buy',
		aud: 8,
		source: 'Jaycar',
		why: 'hold: the box goes quiet and listens; under the face, wired to the Pico. Its body must fit the 15 mm in front of the printer: check the depth before buying'
	},
	{
		group: 'Voice + sound',
		item: 'SB Acoustics SB65WBAC25-4, 2.5" full-range',
		qty: 1,
		status: 'buy',
		aud: 60,
		source: 'Wagner Electronics (Sydney): price not checked',
		why: 'mono, in ~0.9 L with the radiator: clear voice and mids, smooth to the top and wide off-axis (audioXpress bench). Sd 20 cm², Xmax ±2.65 mm (Vd ~5.3 cm³), 20 W rated'
	},
	{
		group: 'Voice + sound',
		item: 'Dayton Audio ND65-PR, 2.5" passive radiator',
		qty: 1,
		status: 'buy',
		aud: 30,
		source: 'Wagner / Parts Express: price not checked',
		why: 'on the left end, into the speaker chamber: bass from ~150 Hz sealed down toward 80–90 Hz, no bigger box. Vd ~7.8 cm³, 1.5× the SB65 (the rule of thumb wants 2×, so the Pi’s EQ high-passes under the tuning). Tune with its 4.3 g mass disc: bare ~94 Hz, with the whole disc ~60 Hz (rough sums; model in WinISD first)'
	},
	{
		group: 'Voice + sound',
		item: 'Small class-D amp board, 2 channel (TPA3116 / TPA3118 mini)',
		qty: 1,
		status: 'buy',
		aud: 30,
		source: 'Altronics / Jaycar / Amazon AU',
		why: 'a separate module on the floor: line in from the sound card, speaker out on screw terminals, power off the 24 V lead, so it swaps without touching the Pi. One channel drives the SB65 (~82 dB/2.83 V; the bass EQ eats headroom, and a limiter keeps it under 20 W); the other is spare for tinkering'
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
		item: 'Rotary encoder with button (EC11)',
		qty: 1,
		status: 'have',
		why: 'the knob under the eye: volume; counterbored into the bay front'
	},
	{
		group: 'Controls',
		item: 'Mini SPDT toggles + 1 chunky SPST',
		qty: 4,
		status: 'have',
		why: 'deck toggles; the chunky one under a cover'
	},
	{ group: 'Controls', item: '30 mm red LED arcade button', qty: 1, status: 'have', why: 'PRINT' },
	{
		group: 'Controls',
		item: 'Small momentary buttons, 6–8 mm brass',
		qty: 3,
		status: 'buy',
		aud: 5,
		source: 'Jaycar / Altronics',
		why: 'under the eye, beside TALK; jobs to settle'
	},
	{
		group: 'Controls',
		item: 'HLK-LD2450 24 GHz radar',
		qty: 1,
		status: 'buy',
		source: 'AliExpress / Amazon AU: price not checked',
		why: 'where people are, by angle and distance, up to 3 at once; wakes the screen and steers the light strip. On the Pico’s UART, behind a window with no metal'
	},
	{
		group: 'Controls',
		item: 'SK6812 strip, 5 mm wide, 60/m, ~0.4 m',
		qty: 1,
		status: 'buy',
		source: 'Core Electronics: price not checked',
		why: 'in an aluminium channel on the plinth, under the overhang: the LEDs facing whoever walks up wash the bench dimly. Run by the Pico'
	},
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
		why: 'the Pi’s plugs, and the printer’s: right-angle plugs at its back take 15 mm off the box’s depth. Check they fit its sockets'
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
	}
];

/** Sum of the "buy" rows, price × qty. */
export const toBuy = () =>
	equipment.filter((e) => e.status === 'buy').reduce((n, e) => n + (e.aud ?? 0) * e.qty, 0);
