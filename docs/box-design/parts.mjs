// The electronics and printer that go in the box: what's on hand, what to buy.
// Prices are AUD, approximate (the source named); "have" rows carry no price.
// v1 is the printer, the lid screen, the speaker and the face, with PRINT and the volume knob on the Pi's
// pins; "later" marks what waits for the deck, voice and the e-ink. The box is cut for all of it.
// Rows carry an optional `url` (a known product page) and `phase: 2` for parts on hand that wait for v2;
// the Equipment tab splits into v1, v2 and tools from these, and saves each row's link, status and notes.
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
		item: 'microSD, 64 GB, A2-rated',
		qty: 1,
		status: 'buy',
		source: 'any shop: SanDisk Extreme or the Raspberry Pi card',
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
		item: 'Waveshare 8" DSI touch, 8-DSI-TOUCH-A, 800×1280, 194 × 119 mm',
		url: 'https://www.amazon.com.au/dp/B0F48FTNTN',
		qty: 1,
		status: 'buy',
		aud: 132,
		source: 'Amazon AU, sold by Waveshare (or Waveshare direct, US$55 + shipping); same outline as the (C), which Core doesn’t stock',
		why: 'the lid screen: toughened, optically bonded glass, so it sits flush in the wood like a tablet, not a bezelled monitor; dimmable from software (0–255 in sysfs). Portrait-native, rotated in software. Takes 5 V from the Pi’s pins. 11.6 mm deep with its Pi-mounting bosses; check against the lid’s ~9 mm behind the glass'
	},
	{
		group: 'Screen + camera',
		item: 'DSI cable, 22-pin to 22-pin, 300–500 mm, for the 8" on the Pi 5',
		qty: 1,
		status: 'buy',
		aud: 8,
		source: 'the screen ships with two 200 mm 22-pin cables; Core’s CE09797 is 22-to-15, the wrong one',
		why: 'the Pi sits on the floor, so the 12–20 cm cable in the box is too short; bench-test the long one'
	},
	{
		group: 'Screen + camera',
		item: 'Pi Camera Module 3 (standard)',
		qty: 1,
		status: 'later',
		aud: 49,
		source: 'Core Electronics, in stock; comes with a 200 mm Pi 5 cable',
		url: 'https://core-electronics.com.au/raspberry-pi-camera-3.html',
		why: 'reads a flyer held up; autofocus up close. Behind a clear spot in the eye window'
	},
	{
		group: 'Screen + camera',
		item: 'Pi 5 camera ribbon, 300 mm',
		qty: 1,
		status: 'later',
		aud: 4,
		source: 'Core CE09776. Not the 457 mm flex: that is the old 15-pin cable, which doesn’t fit the Pi 5',
		url: 'https://core-electronics.com.au/raspberry-pi-camera-fpc-adapter-cable-300mm.html',
		why: 'the Pi 5 needs the narrow 22-pin end'
	},

	{
		group: 'Screen + camera',
		item: 'Waveshare 4.2" e-ink module, 400 × 300, black/white/red (WS-13454)',
		qty: 1,
		status: 'later',
		aud: 58,
		source: 'Core Electronics, dispatch 2–9 Nov',
		url: 'https://core-electronics.com.au/400x300-42inch-e-ink-display-module-three-color-1.html',
		why: 'on the printer lid: the day, readable with the box shut, no power between updates; 103 × 78.5 board fits behind the slot. Bare SPI module on an 8-wire cable to the Pi’s pins; check its Pi 5 GPIO support'
	},
	{
		group: 'Screen + camera',
		item: 'Waveshare 2.42" OLED, 128 × 64 (yellow "(C)" if stocked)',
		qty: 1,
		status: 'later',
		aud: 24,
		source: 'Core Electronics WS-25742, in stock',
		url: 'https://core-electronics.com.au/242inch-oled-display-module-128x64px.html',
		why: 'on the deck by PRINT: what chota is doing. Run by the Pico'
	},
	{
		group: 'Screen + camera',
		item: '1.3" OLED, 128 × 64, I2C (yellow if stocked)',
		qty: 2,
		status: 'later',
		source: 'Core Electronics: price not checked',
		why: 'behind WHO and WHAT: what each dial is set to, the instant it turns'
	},
	{
		group: 'Screen + camera',
		item: 'GlowBit Matrix 8×8 (CE08033), WS2812B, 61 mm square',
		qty: 1,
		status: 'buy',
		aud: 17,
		source: 'Core Electronics, in stock',
		url: 'https://core-electronics.com.au/glowbit-matrix-8x8.html',
		why: "the face, in the eye window over the printer: wake, listening, thinking, talking. The Pi drives it from one GPIO through Adafruit's Pi 5 PIO NeoPixel library (young; fallback: the Pico drives it)"
	},
	{
		group: 'Screen + camera',
		item: 'Adafruit Pixel Shifter (ADA6066), 3.3 → 5 V for the LED data',
		qty: 1,
		status: 'buy',
		source: 'Core Electronics, in stock (the bare 74AHCT125 is out of stock)',
		aud: 8,
		url: 'https://core-electronics.com.au/adafruit-pixel-shifter-addressable-leds-neopixels.html',
		why: 'the LEDs want 5 V data; the Pi\'s pins give 3.3 V',
	},
	{
		group: 'Screen + camera',
		item: 'DFRobot buck 8–28 V → 5 V 3 A (DFR0571)',
		qty: 1,
		status: 'buy',
		aud: 6,
		source: 'Core Electronics, 5 in stock',
		url: 'https://core-electronics.com.au/dc-dc-buck-mode-power-module-8-28v-to-5v-3a.html',
		why: "the LEDs' own 5 V off the 24 V lead, not the Pi's supply. Rated to 28 V in: fine on a regulated 24 V brick"
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
		status: 'later',
		aud: 43,
		source: 'Core Electronics, in stock (bare board, not the A$85 kit)',
		url: 'https://core-electronics.com.au/respeaker-lite-usb-2-mic-array-seeed-studio.html',
		why: 'hears you, behind the front rim. In v1 it only listens; TALK pauses all sound, so echo is no problem'
	},
	{
		group: 'Voice + sound',
		item: 'Momentary push button, 16–19 mm brass, short body (TALK)',
		qty: 1,
		status: 'later',
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
		why: 'on the left end, into the speaker chamber: bass from ~150 Hz sealed down toward 80–90 Hz, no bigger box. Vd ~7.8 cm³, 1.5× the SB65 (the rule of thumb wants 2×, so the Pi’s EQ high-passes under the tuning). Tune with its 4.3 g mass disc: bare ~94 Hz, with the whole disc ~60 Hz (rough sums; model in WinISD first). Bought with the SB65 so its real cut-out templates the hole; fit a blanking plate first and compare sealed against radiator'
	},
	{
		group: 'Voice + sound',
		item: 'Small class-D amp board, 2 channel (TPA3116 / TPA3118 mini)',
		qty: 1,
		status: 'buy',
		aud: 15,
		source: 'Amazon AU ECSiNG TPA3116, no reviews yet: check it has screw terminals. Core has none that runs on 24 V',
		url: 'https://www.amazon.com.au/dp/B0H7L64S4C',
		why: 'a separate module on the floor: line in from the sound card, speaker out on screw terminals, power off the 24 V lead, so it swaps without touching the Pi. One channel drives the SB65 (~82 dB/2.83 V; the bass EQ eats headroom, and a limiter keeps it under 20 W); the other is spare for tinkering'
	},
	{
		group: 'Voice + sound',
		item: '24 V 5 A brick (ALITOVE, 5.5 × 2.1/2.5 mm) + DC Y-splitter + 2200 µF capacitor',
		qty: 1,
		status: 'buy',
		aud: 40,
		source: 'Amazon AU A$33 for the brick; splitter and capacitor about A$7 (match the printer’s DC plug)',
		url: 'https://www.amazon.com.au/dp/B0CRDWLDJ5',
		why: "outside the box, one lead in: feeds the printer and the amp, and retires the printer's own brick. The capacitor sits at the amp. If prints tick in the music, give the amp its own 24 V 3 A pack (A$35)"
	},
	{
		group: 'Voice + sound',
		item: 'Panel-mount DC jack + inline blade fuse (7.5 A)',
		qty: 1,
		status: 'buy',
		aud: 22,
		source: 'Core ADA5607 jack with 30 cm lead A$12; Amazon AU ATC fuse holder 2-pack A$10',
		url: 'https://core-electronics.com.au/round-panel-mount-55mm21mm-dc-barrel-jack-extension-cable-30cm-long.html',
		why: 'the 24 V lead comes in through a proper socket and a fuse straight after it, before the Y-split: a short inside a wooden box blows the fuse, not the brick. Read the printer brick’s label for its rating first'
	},
	{
		group: 'Voice + sound',
		item: 'USB sound card, Adafruit ADA1475',
		qty: 1,
		status: 'buy',
		aud: 11,
		source: 'Core Electronics, in stock',
		url: 'https://core-electronics.com.au/usb-audio-adapter-works-with-raspberry-pi.html',
		why: 'all playback, full quality; the Lite tops out at 16 kHz'
	},

	// controls
	{
		group: 'Controls',
		item: 'Raspberry Pi Pico 2 WH',
		qty: 1,
		status: 'have',
		phase: 2,
		why: 'reads every dial, switch and button; one USB cable to the Pi'
	},
	{
		group: 'Controls',
		item: '10k linear panel pots, ¼" shaft',
		qty: 2,
		status: 'have',
		phase: 2,
		why: 'WHO and WHAT dials'
	},
	{
		group: 'Controls',
		item: 'Rotary encoder with button (EC11)',
		qty: 1,
		status: 'have',
		why: 'the knob under the eye: volume; counterbored into the bay front; on the Pi’s pins in v1'
	},
	{
		group: 'Controls',
		item: 'Mini SPDT toggles + 1 chunky SPST',
		qty: 4,
		status: 'have',
		phase: 2,
		why: 'deck toggles; the chunky one under a cover'
	},
	{ group: 'Controls', item: '30 mm red LED arcade button', qty: 1, status: 'have', why: 'PRINT; on a Pi pin in v1' },
	{
		group: 'Controls',
		item: 'Small momentary buttons, 6–8 mm brass',
		qty: 3,
		status: 'later',
		aud: 5,
		source: 'Jaycar / Altronics',
		why: 'under the eye, beside TALK; jobs to settle'
	},
	{
		group: 'Controls',
		item: 'HLK-LD2450 24 GHz radar',
		qty: 1,
		status: 'later',
		source: 'AliExpress / Amazon AU: price not checked',
		why: 'where people are, by angle and distance, up to 3 at once; wakes the screen and steers the light strip. On the Pico’s UART, behind a window with no metal'
	},
	{
		group: 'Controls',
		item: 'SK6812 strip, 5 mm wide, 60/m, ~0.4 m',
		qty: 1,
		status: 'later',
		source: 'Core Electronics: price not checked',
		why: 'in an aluminium channel on the plinth, under the overhang: the LEDs facing whoever walks up wash the bench dimly. Run by the Pico'
	},
	{ group: 'Controls', item: '10 mm diffused LEDs', qty: 25, status: 'have', phase: 2, why: 'status lights' },
	{
		group: 'Controls',
		item: 'Analog panel meter, 0–1 mA',
		qty: 1,
		status: 'later',
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
		aud: 20,
		source: 'Amazon AU elechawk kit (Core’s DFRobot kit is A$11 but needs crimping)',
		url: 'https://www.amazon.com.au/dp/B08G188ZQ8',
		why: 'Dupont loosens in a box that moves'
	},
	{
		group: 'Wiring',
		item: 'Right-angle USB-A and USB-C adapters',
		qty: 1,
		status: 'buy',
		aud: 18,
		source: 'Core ADA4432 right-angle USB-C A$7.50; USB-A from Amazon AU (2-pack A$10, not at Core)',
		url: 'https://core-electronics.com.au/right-angle-usb-type-c-adapter-usb-3-1-gen-4-compatible.html',
		why: 'the Pi’s plugs, and the printer’s: right-angle plugs at its back take 15 mm off the box’s depth. Check they fit its sockets'
	},
	{
		group: 'Tools',
		item: 'Pinecil V2 soldering iron',
		qty: 1,
		status: 'buy',
		aud: 99,
		source: 'Amazon AU (Core has the original at A$150)',
		url: 'https://www.amazon.com.au/dp/B096X6SG13',
		why: 'the buck, GlowBit, amp leads, pots and meter. USB-C PD at 12–24 V'
	},
	{
		group: 'Tools',
		item: 'Soldering iron stand, spring type',
		qty: 1,
		status: 'buy',
		aud: 10,
		source: 'Amazon AU, delivery ~3 Nov (Hakko FH300 A$22, Pinecil fit unchecked)',
		url: 'https://www.amazon.com.au/dp/B08JLJLX4D',
		why: 'somewhere safe to put a hot iron down'
	},
	{
		group: 'Tools',
		item: 'Raspberry Pi 45 W USB-C PSU (CE10156)',
		qty: 1,
		status: 'buy',
		aud: 25,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/raspberry-pi-45-w-usb-c-power-supply-au.html',
		why: 'powers the Pinecil at 20 V; the 27 W Pi supply stays on the Pi'
	},
	{
		group: 'Tools',
		item: 'Assembled Pi T-Cobbler Plus + ribbon (ADA2028)',
		qty: 1,
		status: 'buy',
		aud: 17,
		source: 'Core Electronics (bare CE04441 breakout is A$6)',
		url: 'https://core-electronics.com.au/assembled-pi-t-cobbler-plus-gpio-breakout-for-raspberry-pi-b.html',
		why: 'the Pi’s 40 pins onto the breadboard, labelled'
	},
	{
		group: 'Tools',
		item: 'AstroAI multimeter, 4000-count, autoranging',
		qty: 1,
		status: 'buy',
		aud: 30,
		source: 'Amazon AU (Jaycar QM1321 A$51)',
		url: 'https://www.amazon.com.au/dp/B0DKXTR485',
		why: 'voltages, continuity and shorts before anything powers up'
	},
	{
		group: 'Tools',
		item: 'Solder 0.8 mm (lead-free 15 g, or 60/40 200 g A$34)',
		qty: 1,
		status: 'buy',
		aud: 6,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/tools/soldering/solder.html',
		why: '60/40 flows more easily; wash hands after'
	},
	{
		group: 'Tools',
		item: 'Flux pen (MEK-H010017)',
		qty: 1,
		status: 'buy',
		aud: 12,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/refillable-flux-pen-soldering-mektronics.html',
		why: 'clean joints on header pins and pads'
	},
	{
		group: 'Tools',
		item: 'Brass tip cleaner with holder (Weller)',
		qty: 1,
		status: 'buy',
		aud: 17,
		source: 'Amazon AU',
		url: 'https://www.amazon.com.au/dp/B08FQBS97L',
		why: 'keeps the tip tinned; a damp sponge works too'
	},
	{
		group: 'Tools',
		item: 'Wire stripper 22–10 AWG (CE09625)',
		qty: 1,
		status: 'buy',
		aud: 6,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/wire-stripper-22-10-awg.html',
		why: ''
	},
	{
		group: 'Tools',
		item: 'Flush cutters (CHP170)',
		qty: 1,
		status: 'buy',
		aud: 20,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/flush-diagonal-cutters-chp170.html',
		why: 'trims leads flush after soldering'
	},
	{
		group: 'Tools',
		item: 'Needle-nose pliers',
		qty: 1,
		status: 'buy',
		aud: 7,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/needle-nose-pliers.html',
		why: ''
	},
	{
		group: 'Tools',
		item: '22 AWG solid hook-up wire, 6 colours',
		qty: 1,
		status: 'buy',
		aud: 28,
		source: 'Amazon AU TUOFENG (Core set A$45)',
		url: 'https://www.amazon.com.au/dp/B07TX6BX47',
		why: 'sits neatly in the breadboard'
	},
	{
		group: 'Tools',
		item: '22 AWG silicone stranded wire, 10 colours',
		qty: 1,
		status: 'buy',
		aud: 20,
		source: 'Amazon AU BNTECHGO (Core kit A$30)',
		url: 'https://www.amazon.com.au/dp/B01M0O1NXM',
		why: 'flexible leads for power and anything that moves'
	},
	{
		group: 'Tools',
		item: 'Resistor kit, 600 × ¼ W 1% (CE05092)',
		qty: 1,
		status: 'buy',
		aud: 3,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/600-pack-of-1-4-watt-1-resistors-30-values-20-of-each.html',
		why: '330 Ω for LEDs and the GlowBit data line, plus pull-ups'
	},
	{
		group: 'Tools',
		item: '1000 µF 25 V capacitor (COM-08982)',
		qty: 2,
		status: 'buy',
		aud: 1,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/electrolytic-decoupling-capacitors-1000uf-25v.html',
		why: 'across the GlowBit’s 5 V'
	},
	{
		group: 'Tools',
		item: 'Heat-shrink pack, 95 pc',
		qty: 1,
		status: 'buy',
		aud: 16,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/heatshrink-pack-standard.html',
		why: ''
	},
	{
		group: 'Tools',
		item: 'Silicone heat mat',
		qty: 1,
		status: 'buy',
		aud: 14,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/silicone-heat-mat.html',
		why: 'saves the desk'
	},
	{
		group: 'Tools',
		item: 'Third hand with magnifier',
		qty: 1,
		status: 'buy',
		aud: 14,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/third-hand-and-magnifying-glass.html',
		why: 'holds boards and wires while you solder'
	},
	{
		group: 'Tools',
		item: 'Precision screwdriver kit, 24-in-1',
		qty: 1,
		status: 'buy',
		aud: 6,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/24-in-1-precision-screwdriver-kit.html',
		why: 'screw terminals on the amp and buck'
	},
	{
		group: 'Tools',
		item: 'USB logic analyser, 24 MHz 8-ch (TOL-18627), optional',
		qty: 1,
		status: 'later',
		aud: 30,
		source: 'Amazon AU Lonely Binary kit; works with PulseView (Core A$49)',
		url: 'https://www.amazon.com.au/dp/B0FKGN3JMZ',
		why: 'shows the signals on a wire when something won’t talk'
	},
	{
		group: 'Tools',
		item: 'Raspberry Pi 5 bumper (CE09979)',
		qty: 1,
		status: 'buy',
		aud: 5,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/raspberry-pi-5-bumper-case.html',
		why: 'the bare Pi on the desk without shorting on anything; comes off for the box'
	},
	{
		group: 'Tools',
		item: 'Raspberry Pi Pico 2 WH, a spare for the bench',
		qty: 1,
		status: 'buy',
		aud: 14,
		source: 'Core Electronics CE10155',
		url: 'https://core-electronics.com.au/raspberry-pi-pico-2-wh-with-headers.html',
		why: 'try deck ideas (dials, OLEDs, meter) on the breadboard while the first stays with the box'
	},
	{
		group: 'Tools',
		item: 'USB-C power meter (Adafruit ADA4232), optional',
		qty: 1,
		status: 'later',
		aud: 47,
		source: 'Core Electronics',
		url: 'https://core-electronics.com.au/multifunctional-usb-digital-tester-usb-a-and-c.html',
		why: 'what the Pi and screen really draw'
	},
	{
		group: 'Tools',
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
	equipment.filter((e) => e.status === 'buy' && e.group !== 'Tools').reduce((n, e) => n + (e.aud ?? 0) * e.qty, 0);

export const toolsCost = () =>
	equipment.filter((e) => e.group === 'Tools' && e.status === 'buy').reduce((n, e) => n + (e.aud ?? 0) * e.qty, 0);
