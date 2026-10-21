// The wiring data for the box: the Pi 5 header, the Pico 2 W pinout, and every part wired to them.
// One source of truth: build-page.mjs inlines this into the Wiring tab, and the checks (wiring-checks.mjs) run on it.
// Wiring facts that box.md decides are status 'decided'; every pin picked here is 'proposed' with a reason.
// Part ids are new (parts.mjs has none); `item` names the matching row in parts.mjs.

// Alt functions are written 'FN' or 'FN|bus'. A bus is something a driver takes whole (I2C1, SPI0, UART0, ...).
const alt = (s) => {
	const [fn, bus] = s.split('|');
	return bus ? { fn, bus } : { fn };
};

// Pi 5 header, physical pin → [name, GPIO, type, alts]. Source: pinout.xyz and the Raspberry Pi GPIO docs.
// Alts are the ones the Pi 5 header offers (RP1); pinout.xyz lists the same set for the 40-pin header.
const PI = {
	1: ['3V3', null, '3v3'],
	2: ['5V', null, '5v'],
	3: ['GPIO2', 2, 'gpio', ['SDA1|i2c1']],
	4: ['5V', null, '5v'],
	5: ['GPIO3', 3, 'gpio', ['SCL1|i2c1']],
	6: ['GND', null, 'gnd'],
	7: ['GPIO4', 4, 'gpio', ['GPCLK0']],
	8: ['GPIO14', 14, 'gpio', ['TXD0|uart0']],
	9: ['GND', null, 'gnd'],
	10: ['GPIO15', 15, 'gpio', ['RXD0|uart0']],
	11: ['GPIO17', 17, 'gpio', ['SPI1 CE1|spi1', 'CTS0|uart0']],
	12: ['GPIO18', 18, 'gpio', ['PCM CLK|pcm', 'SPI1 CE0|spi1', 'PWM0']],
	13: ['GPIO27', 27, 'gpio'],
	14: ['GND', null, 'gnd'],
	15: ['GPIO22', 22, 'gpio'],
	16: ['GPIO23', 23, 'gpio'],
	17: ['3V3', null, '3v3'],
	18: ['GPIO24', 24, 'gpio'],
	19: ['GPIO10', 10, 'gpio', ['MOSI0|spi0']],
	20: ['GND', null, 'gnd'],
	21: ['GPIO9', 9, 'gpio', ['MISO0|spi0']],
	22: ['GPIO25', 25, 'gpio'],
	23: ['GPIO11', 11, 'gpio', ['SCLK0|spi0']],
	24: ['GPIO8', 8, 'gpio', ['CE0|spi0']],
	25: ['GND', null, 'gnd'],
	26: ['GPIO7', 7, 'gpio', ['CE1|spi0']],
	27: ['GPIO0', 0, 'id', ['ID_SD (HAT EEPROM)']],
	28: ['GPIO1', 1, 'id', ['ID_SC (HAT EEPROM)']],
	29: ['GPIO5', 5, 'gpio', ['GPCLK1']],
	30: ['GND', null, 'gnd'],
	31: ['GPIO6', 6, 'gpio', ['GPCLK2']],
	32: ['GPIO12', 12, 'gpio', ['PWM0']],
	33: ['GPIO13', 13, 'gpio', ['PWM0']],
	34: ['GND', null, 'gnd'],
	35: ['GPIO19', 19, 'gpio', ['PCM FS|pcm', 'MISO1|spi1', 'PWM0']],
	36: ['GPIO16', 16, 'gpio', ['SPI1 CE2|spi1', 'CTS0|uart0']],
	37: ['GPIO26', 26, 'gpio'],
	38: ['GPIO20', 20, 'gpio', ['PCM DIN|pcm', 'MOSI1|spi1']],
	39: ['GND', null, 'gnd'],
	40: ['GPIO21', 21, 'gpio', ['PCM DOUT|pcm', 'SCLK1|spi1']]
};

export const piPins = Object.entries(PI).map(([n, [name, gpio, type, alts = []]]) => ({
	n: +n,
	name,
	gpio,
	type,
	alts: alts.map(alt)
}));

// Pico 2 W: the RP2350 muxes every GPIO the same way, so the alts follow from the number:
// I2C bus = (n/2) odd/even, SDA on even; SPI bus = (n/8) even/odd, RX CSn SCK TX by n%4;
// UART bus = (n/4) even/odd, TX on n%4==0, RX on 1; PWM slice (n/2)%8, A on even.
// Physical pin order from Raspberry Pi's Pico 2 W pinout PDF (not re-read this session; matches the Pico W layout).
const PICO_ORDER = [
	0, 1, 'GND', 2, 3, 4, 5, 'GND', 6, 7, 8, 9, 'GND', 10, 11, 12, 13, 'GND', 14, 15,
	16, 17, 'GND', 18, 19, 20, 21, 'GND', 22, 'RUN', 26, 27, 'AGND', 28, 'ADC_VREF', '3V3', '3V3_EN', 'GND', 'VSYS', 'VBUS'
];
const picoAlts = (g) => {
	const out = [];
	if (g % 4 < 2) out.push({ fn: `UART${Math.floor(g / 4) % 2} ${g % 4 ? 'RX' : 'TX'}`, bus: `uart${Math.floor(g / 4) % 2}` });
	out.push({ fn: `I2C${Math.floor(g / 2) % 2} ${g % 2 ? 'SCL' : 'SDA'}`, bus: `i2c${Math.floor(g / 2) % 2}` });
	out.push({ fn: `SPI${Math.floor(g / 8) % 2} ${['RX', 'CSn', 'SCK', 'TX'][g % 4]}`, bus: `spi${Math.floor(g / 8) % 2}` });
	out.push({ fn: `PWM${Math.floor(g / 2) % 8}${g % 2 ? 'B' : 'A'}` });
	if (g >= 26 && g <= 28) out.unshift({ fn: `ADC${g - 26}` });
	return out;
};
const PICO_TYPE = { GND: 'gnd', AGND: 'gnd', '3V3': '3v3', VSYS: 'vsys', VBUS: 'vbus', RUN: 'ctl', ADC_VREF: 'ctl', '3V3_EN': 'ctl' };
export const picoPins = PICO_ORDER.map((p, i) => {
	const isGpio = typeof p === 'number';
	return {
		n: i + 1,
		name: isGpio ? `GP${p}` : p === '3V3' ? '3V3(OUT)' : p,
		gpio: isGpio ? p : null,
		type: isGpio ? 'gpio' : PICO_TYPE[p],
		alts: isGpio ? picoAlts(p) : []
	};
});

// Where each board's checks and tabs come from.
export const boards = {
	pi: {
		id: 'pi',
		title: 'Raspberry Pi 5, 40-pin header',
		// Header drawn with USB ports down: pin 1 top-left, odd pins on the inner column, even pins on the board edge.
		note: 'Board held with the USB and Ethernet ports at the bottom. Pin 1 (3V3) is at the top left, on the inner column; even pins run down the board edge on the right.',
		pins: piPins,
		url: 'https://pinout.xyz/',
		// Buses the Linux driver takes whole: other parts must keep off these pins while the bus is in use.
		exclusive: true
	},
	pico: {
		id: 'pico',
		title: 'Raspberry Pi Pico 2 W',
		note: 'Board held with the micro-USB port at the top. Pin 1 (GP0) is at the top left; pins 21 to 40 run up the right edge. Every GPIO can take several functions, so a bus is only a choice of pins here.',
		pins: picoPins,
		url: 'https://datasheets.raspberrypi.com/picow/pico-2-w-pinout.pdf',
		exclusive: false
	}
};

// Limits the checks use. mA. `note` says where the figure comes from and how sure it is.
export const limits = {
	pi5v: {
		label: 'Pi 5 V header pins',
		mA: 3400,
		note: 'The 5 V pins pass the PSU straight through. The 27 W supply gives 5 A at 5 V; 1.6 A of it is held back for USB, and the Pi board draws from the rest, so this is a planning figure, not a pin rating. Raspberry Pi docs give no per-pin limit.',
		url: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#raspberry-pi-5'
	},
	pi3v3: {
		label: 'Pi 3.3 V header pins',
		mA: 500,
		note: 'Unconfirmed: the Raspberry Pi docs state no current for the 3V3 pins. 500 mA is an assumed planning cap; GPIO pins together are documented at 50 mA and 16 mA each.',
		url: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#gpio'
	},
	usb: {
		label: 'Pi USB ports, total',
		mA: 1600,
		note: 'With the 27 W / 5 A supply the Pi 5 allows 1.6 A to USB peripherals; with another supply it holds to 600 mA. Anything on the Pico counts here too, since it runs off the Pico USB lead.',
		url: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#raspberry-pi-5'
	},
	buck: {
		label: '24 to 5 V buck output',
		mA: 3000,
		note: 'Core Electronics lists the DFR0571 at 5 V 3 A; some retailers list 1.6 A for the same SKU. Unconfirmed: read the board before loading it.',
		url: 'https://core-electronics.com.au/dc-dc-buck-mode-power-module-8-28v-to-5v-3a.html'
	},
	v24: {
		label: '24 V brick',
		mA: 5000,
		note: 'The ALITOVE brick is 24 V 5 A (parts.mjs); the fuse is 7.5 A. Printer (2000) and amp (1200) are estimates; the buck\'s share is worked out from its 5 V loads at 90% efficiency (assumed).',
		url: 'https://www.amazon.com.au/dp/B0CRDWLDJ5'
	},
	pico3v3: { label: 'Pico 3V3(OUT)', mA: null, note: 'Sum only. The Pico 2 W datasheet limit was not read; keep this small.', url: 'https://datasheets.raspberrypi.com/picow/pico-2-w-pinout.pdf' },
	picoVbus: { label: 'Pico VBUS / 5 V', mA: null, note: 'Sum only. It all comes from the Pi USB port and counts against the USB total.', url: 'https://datasheets.raspberrypi.com/picow/pico-2-w-pinout.pdf' }
};

// A part pin: { partPin, to (physical pin or null), ext (where it goes off-header), wire, status, note, dir, bus, fn, via }
// dir: 'out' = the board drives the part's input, 'in' = the part drives the board, 'bi' = both, 'pwr' = power or ground.
// bus/fn: the bus function the pin is used for; fn must be one of the pin's alts (the page checks).
// via: id of a level-shifter part the signal passes through.
const D = 'decided',
	P = 'proposed';
const pwr = (partPin, to, wire, status, note, extra = {}) => ({ partPin, to, wire, status, note, dir: 'pwr', ...extra });

export const parts = [
	// ---- Pi 5 header ----
	{
		id: 'lid-screen',
		item: 'Waveshare 8" DSI touch, 8-DSI-TOUCH-A',
		name: 'Lid screen (8" DSI)',
		short: 'Lid screen',
		phase: 'v1',
		board: 'dsi',
		logic: '3v3',
		currentMa: 800,
		docsUrl: 'https://www.waveshare.com/wiki/8-DSI-TOUCH-A',
		pins: [
			{ partPin: 'DSI ribbon', to: null, wire: 'ribbon', status: D, dir: 'bi', note: 'Waveshare: 22-pin FFC to the Pi 5; DSI1 is the default. Overlay dtoverlay=vc4-kms-dsi-waveshare-panel-v2,8_0_inch_a.' },
			pwr('5V', 4, 'red', P, 'Waveshare: 5 V and GND come from the header through its GPIO cable; it gives no pin numbers. Any 5 V pin works; pin 4 sits beside the GND on pin 6.'),
			pwr('GND', 6, 'black', P, 'Next to pin 4, so the two wires run together.')
		],
		note: 'Needs at least 0.8 A or it fails to start (Waveshare). Backlight is software only, 0 to 255 in sysfs. Whether touch runs over the header I2C or the ribbon is not stated on the wiki; the wiring here keeps pins 3 and 5 free just in case.'
	},
	{
		id: 'printer',
		item: 'MUNBYN ITPP098P 80 mm thermal printer',
		name: 'Thermal printer',
		short: 'Printer',
		phase: 'v1',
		board: 'usb',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		draw: [{ rail: 'v24', mA: 2000 }],
		pins: [
			{ partPin: 'USB-B', to: null, wire: 'ribbon', status: D, dir: 'bi', note: 'Data only; it runs off the 24 V brick, not from USB.' },
			{ partPin: 'DC in', to: null, wire: 'red', status: D, dir: 'pwr', note: '24 V from the Y-splitter; this replaces the printer\'s own brick (box.md).' }
		],
		note: 'Right-angle USB-B and DC plugs (see parts.mjs). The 2000 mA at 24 V is a guess: read the printer brick\'s label (box.md says to).'
	},
	{
		id: 'sound-card',
		item: 'USB sound card, Adafruit ADA1475',
		name: 'USB sound card',
		short: 'Sound card',
		phase: 'v1',
		board: 'usb',
		logic: '3v3',
		currentMa: 100,
		docsUrl: 'https://core-electronics.com.au/usb-audio-adapter-works-with-raspberry-pi.html',
		pins: [
			{ partPin: 'USB-A', to: null, wire: 'ribbon', status: D, dir: 'bi', note: 'All playback goes through it.' },
			{ partPin: 'line out', to: null, wire: 'green', status: D, dir: 'out', note: 'Line out to the amp\'s input (parts.mjs: "line in from the sound card").' }
		],
		note: 'Current is an estimate (about 100 mA); the ADA1475 draw was not found.'
	},
	{
		id: 'face-shifter',
		item: 'Adafruit Pixel Shifter (ADA6066)',
		name: 'Level shifter (Pixel Shifter)',
		short: 'Shifter',
		phase: 'v1',
		board: 'pi',
		logic: '3v3',
		currentMa: 5,
		supply: 'buck',
		docsUrl: 'https://learn.adafruit.com/adafruit-pixel-shifter/pinouts',
		pins: [
			{ partPin: 'DAT in', to: 33, wire: 'green', status: D, dir: 'out', note: 'Face data on GPIO 13 (box.md). The Pi 5 NeoPixel library drives it through the PIO block, so any GPIO would do.' },
			pwr('G', 34, 'black', P, 'Ties the shifter, the face and the buck to one ground. Pin 34 is next to pin 33, so the signal and its ground run together.'),
			{ partPin: 'V', to: null, wire: 'red', status: P, dir: 'pwr', note: 'Power it from 5 V so the output swings to 5 V. Adafruit says "give it the same power as the logic level of your microcontroller" and also 3 to 5 V; the wiki leaves this unclear, so check the output with a meter.' },
			{ partPin: 'D5 out', to: null, wire: 'green', status: D, dir: 'out', note: 'The ADA6066 is a 74HCT2G34, not the 74AHCT125 box.md names. It still lifts 3.3 V to 5 V. Its CLK channel is spare.' }
		],
		note: 'Adafruit lists the pins as DAT and CLK in, D5, !D5 and C5 out, V and G for power.'
	},
	{
		id: 'face',
		item: 'GlowBit Matrix 8×8 (CE08033), WS2812B, 61 mm square',
		name: 'Face (GlowBit 8×8)',
		short: 'Face',
		phase: 'v1',
		board: 'pi',
		logic: '5v',
		currentMa: 1000,
		supply: 'buck',
		docsUrl: 'https://core-electronics.com.au/glowbit-matrix-8x8.html',
		pins: [
			{ partPin: 'DIN', to: null, wire: 'green', status: D, dir: 'out', via: 'face-shifter', note: 'Pin names are unconfirmed: Core\'s page only says one data pin, WS2812B-compatible. Read the silkscreen.' },
			{ partPin: '5V', to: null, wire: 'red', status: D, dir: 'pwr', note: '5 V from the 24 to 5 V buck, not the Pi (box.md).' },
			{ partPin: 'GND', to: null, wire: 'black', status: D, dir: 'pwr', note: 'Common with the Pi through the shifter ground on pin 34.' }
		],
		note: '64 WS2812B draw about 3.8 A at full white (general figure, not a GlowBit spec). 1000 mA assumes brightness capped in software to about a quarter.'
	},
	{
		id: 'buck',
		item: 'DFRobot buck 8–28 V → 5 V 3 A (DFR0571)',
		name: '24 to 5 V buck',
		short: 'Buck',
		phase: 'v1',
		board: 'pi',
		logic: '3v3',
		currentMa: 0,
		docsUrl: 'https://core-electronics.com.au/dc-dc-buck-mode-power-module-8-28v-to-5v-3a.html',
		pins: [
			{ partPin: 'VIN', to: null, wire: 'red', status: D, dir: 'pwr', note: 'On the 24 V lead (box.md). Terminal labels not confirmed: the DFRobot wiki was unreachable.' },
			{ partPin: 'VOUT', to: null, wire: 'red', status: D, dir: 'pwr', note: 'Powers the face and its shifter (and the light strip later). Not connected to the Pi.' }
		],
		note: 'Shown so the 5 V load on it gets checked.'
	},
	{
		id: 'print-button',
		item: '30 mm red LED arcade button',
		name: 'PRINT button',
		short: 'PRINT',
		phase: 'v1',
		board: 'pi',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: 'switch', to: 29, wire: 'orange', status: P, dir: 'in', note: 'GPIO 5 (pin 29): plain GPIO, no bus, internal pull-up, pressed pulls to ground. Read through hw.py.' },
			pwr('switch', 30, 'black', P, 'Ground next to pin 29.')
		],
		note: 'The button\'s own LED terminals are left unwired in v1.'
	},
	{
		id: 'volume',
		item: 'Rotary encoder with button (EC11)',
		name: 'Volume knob (EC11)',
		short: 'Volume',
		phase: 'v1',
		board: 'pi',
		logic: '3v3',
		currentMa: 0,
		docsUrl: 'https://wiki.dfrobot.com/SEN0235',
		pins: [
			{ partPin: 'CLK (A)', to: 13, wire: 'blue', status: P, dir: 'in', note: 'GPIO 27 (pin 13): plain GPIO. Pins 13 to 16 are a tidy cluster with a ground at 14, away from SPI0 and I2C1.' },
			{ partPin: 'DT (B)', to: 15, wire: 'yellow', status: P, dir: 'in', note: 'GPIO 22 (pin 15).' },
			{ partPin: 'SW', to: 16, wire: 'white', status: P, dir: 'in', note: 'GPIO 23 (pin 16), active low.' },
			pwr('GND', 14, 'black', P, 'Ground in the middle of the cluster.')
		],
		note: 'Leave the "+" pin off: the Pi\'s internal pull-ups do the job, and a 5 V pull-up on a 3.3 V GPIO would be wrong. Module pinout from DFRobot\'s EC11 board (GND, +, SW, DT, CLK); check your board\'s silkscreen.'
	},
	{
		id: 'eink',
		item: 'Waveshare 4.2" e-ink module, 400 × 300, black/white/red (WS-13454)',
		name: 'E-ink 4.2" (SPI0)',
		short: 'E-ink',
		phase: 'later',
		board: 'pi',
		logic: '3v3',
		currentMa: 10,
		docsUrl: 'https://www.waveshare.com/wiki/4.2inch_e-Paper_Module_(B)_Manual',
		pins: [
			pwr('VCC', 17, 'grey', D, 'Waveshare table: VCC to 3.3 V. The module also takes 5 V, but the IO level must match its supply, so use 3.3 V.'),
			pwr('GND', 20, 'brown', P, 'Any ground; pin 20 is next to the SPI pins. box.md says to run ground beside the clock line.'),
			{ partPin: 'DIN', to: 19, wire: 'blue', status: D, dir: 'out', bus: 'spi0', fn: 'MOSI0', note: 'SPI0 MOSI, GPIO 10.' },
			{ partPin: 'CLK', to: 23, wire: 'yellow', status: D, dir: 'out', bus: 'spi0', fn: 'SCLK0', note: 'SPI0 SCLK, GPIO 11. Drop to about 1 MHz on the 30 to 40 cm cable (box.md).' },
			{ partPin: 'CS', to: 24, wire: 'orange', status: D, dir: 'out', bus: 'spi0', fn: 'CE0', note: 'SPI0 CE0, GPIO 8.' },
			{ partPin: 'DC', to: 22, wire: 'green', status: D, dir: 'out', note: 'GPIO 25 (box.md).' },
			{ partPin: 'RST', to: 11, wire: 'white', status: D, dir: 'out', note: 'GPIO 17 (box.md).' },
			{ partPin: 'BUSY', to: 18, wire: 'purple', status: D, dir: 'in', note: 'GPIO 24 (box.md).' }
		],
		note: 'Pins are box.md\'s. Wire colours follow Waveshare\'s usual cable and are unconfirmed for this module. Current is a small estimate (refresh draw is a few mA). Check Waveshare\'s code on Pi 5 GPIO.'
	},
	{
		id: 'respeaker',
		item: 'Seeed ReSpeaker Lite (2-mic, XU316, USB)',
		name: 'ReSpeaker Lite (mic)',
		short: 'Mic',
		phase: 'later',
		board: 'usb',
		logic: '3v3',
		currentMa: 25,
		docsUrl: 'https://www.seeed.cc/product/respeaker-lite-2-mic-array-voice-kit-compatible-with-esphome',
		pins: [{ partPin: 'USB-C', to: null, wire: 'ribbon', status: D, dir: 'bi', note: 'Draws about 19 to 22 mA (Seeed spec sheet, via a summary).' }],
		note: 'Mic only; it records at up to 16 kHz.'
	},
	{
		id: 'camera',
		item: 'Pi Camera Module 3 (standard)',
		name: 'Camera Module 3',
		short: 'Camera',
		phase: 'later',
		board: 'dsi',
		logic: '3v3',
		currentMa: 0,
		docsUrl: 'https://www.raspberrypi.com/documentation/accessories/camera.html',
		pins: [{ partPin: 'CSI ribbon', to: null, wire: 'ribbon', status: D, dir: 'bi', note: 'Takes the Pi 5\'s other ribbon port, since the lid screen is on DSI1. Powered from the port.' }],
		note: 'Pi 5 cable, 300 mm.'
	},
	{
		id: 'pico',
		item: 'Raspberry Pi Pico 2 WH',
		name: 'Pico 2 WH',
		short: 'Pico',
		phase: 'later',
		board: 'usb',
		logic: '3v3',
		currentMa: 50,
		docsUrl: 'https://datasheets.raspberrypi.com/picow/pico-2-w-pinout.pdf',
		pins: [{ partPin: 'micro-USB', to: null, wire: 'ribbon', status: D, dir: 'bi', note: 'Power and JSON-lines serial in one lead (box.md).' }],
		note: 'About 50 mA for the board (box.md). What hangs off its pins is added on the Pico tab and counts against the Pi USB total.'
	},

	// ---- Pico 2 W ----
	{
		id: 'oled-a',
		item: '1.3" OLED, 128 × 64, I2C',
		name: '1.3" OLED A (I2C0)',
		short: 'OLED A',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 20,
		docsUrl: 'https://www.tinytronics.nl/shop/en/displays/oled/1.3-inch-oled-display-128*64-pixels-white-i2c',
		pins: [
			pwr('VCC', 36, 'red', P, '3V3(OUT). These modules take 3.3 to 5 V; 3.3 V keeps the I2C lines at 3.3 V.'),
			pwr('GND', 8, 'black', P, 'Near the I2C0 pins.'),
			{ partPin: 'SDA', to: 6, wire: 'blue', status: P, dir: 'bi', bus: 'i2c0', fn: 'I2C0 SDA', note: 'GP4. One OLED per bus so both keep address 0x3C (box.md).' },
			{ partPin: 'SCL', to: 7, wire: 'yellow', status: P, dir: 'out', bus: 'i2c0', fn: 'I2C0 SCL', note: 'GP5.' }
		],
		note: 'Controller is SH1106 or SSD1306 depending on the listing; SH1106 has a 2-pixel offset. Pin order varies, check the silkscreen. Current is an estimate.'
	},
	{
		id: 'oled-b',
		item: '1.3" OLED, 128 × 64, I2C',
		name: '1.3" OLED B (I2C1)',
		short: 'OLED B',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 20,
		docsUrl: 'https://www.tinytronics.nl/shop/en/displays/oled/1.3-inch-oled-display-128*64-pixels-white-i2c',
		pins: [
			pwr('VCC', 36, 'red', P, '3V3(OUT).'),
			pwr('GND', 3, 'black', P, 'Beside GP2.'),
			{ partPin: 'SDA', to: 4, wire: 'green', status: P, dir: 'bi', bus: 'i2c1', fn: 'I2C1 SDA', note: 'GP2, on the second bus so it can also be 0x3C.' },
			{ partPin: 'SCL', to: 5, wire: 'white', status: P, dir: 'out', bus: 'i2c1', fn: 'I2C1 SCL', note: 'GP3.' }
		],
		note: 'Same module as A.'
	},
	{
		id: 'oled-242',
		item: 'Waveshare 2.42" OLED, 128 × 64',
		name: '2.42" OLED (SPI1)',
		short: 'OLED 2.42"',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 40,
		docsUrl: 'https://www.waveshare.com/wiki/2.42inch_OLED_Module',
		pins: [
			pwr('VCC', 36, 'red', P, '3V3(OUT). Takes 3.3 or 5 V (Waveshare).'),
			pwr('GND', 18, 'black', P, 'Beside the SPI1 pins.'),
			{ partPin: 'DIN', to: 15, wire: 'blue', status: P, dir: 'out', bus: 'spi1', fn: 'SPI1 TX', note: 'GP11, SPI1 TX. SPI1 keeps clear of the I2C pins above.' },
			{ partPin: 'CLK', to: 14, wire: 'yellow', status: P, dir: 'out', bus: 'spi1', fn: 'SPI1 SCK', note: 'GP10, SPI1 SCK.' },
			{ partPin: 'CS', to: 17, wire: 'orange', status: P, dir: 'out', bus: 'spi1', fn: 'SPI1 CSn', note: 'GP13, SPI1 CSn.' },
			{ partPin: 'DC', to: 16, wire: 'green', status: P, dir: 'out', note: 'GP12, plain GPIO.' },
			{ partPin: 'RES', to: 19, wire: 'white', status: P, dir: 'out', note: 'GP14, plain GPIO.' }
		],
		note: 'Default is 4-wire SPI. Use the display-off command rather than dimming (box.md). Waveshare\'s 7-pin connector order was not checked against a board.'
	},
	{
		id: 'pots',
		item: '10k linear panel pots, ¼" shaft',
		name: 'WHO / WHAT pots',
		short: 'Pots',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 1,
		docsUrl: null,
		pins: [
			pwr('ends (high)', 36, 'red', P, '3V3(OUT) for the top of both pots.'),
			pwr('ends (low)', 33, 'black', P, 'AGND, the quiet ground for the ADC.'),
			{ partPin: 'WHO wiper', to: 31, wire: 'blue', status: P, dir: 'in', fn: 'ADC0', note: 'GP26, ADC0. The Pi has no ADC, which is why these are on the Pico (box.md).' },
			{ partPin: 'WHAT wiper', to: 32, wire: 'green', status: P, dir: 'in', fn: 'ADC1', note: 'GP27, ADC1.' }
		],
		note: 'About 0.3 mA each from 3.3 V.'
	},
	{
		id: 'toggles',
		item: 'Mini SPDT toggles + 1 chunky SPST',
		name: 'Deck toggles (4)',
		short: 'Toggles',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: 'toggle 1', to: 9, wire: 'blue', status: P, dir: 'in', note: 'GP6. Switch to ground, internal pull-up.' },
			{ partPin: 'toggle 2', to: 10, wire: 'green', status: P, dir: 'in', note: 'GP7.' },
			{ partPin: 'toggle 3', to: 11, wire: 'yellow', status: P, dir: 'in', note: 'GP8.' },
			{ partPin: 'toggle 4 (chunky)', to: 12, wire: 'orange', status: P, dir: 'in', note: 'GP9.' },
			pwr('common', 13, 'black', P, 'Ground beside the four inputs.')
		],
		note: 'Four free GPIOs in a row on the left edge.'
	},
	{
		id: 'talk',
		item: 'Momentary push button, 16–19 mm brass, short body (TALK)',
		name: 'TALK button',
		short: 'TALK',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: 'switch', to: 20, wire: 'orange', status: P, dir: 'in', note: 'GP15. TALK goes to the Pico (box.md); hold to pause sound and listen.' },
			pwr('switch', 18, 'black', P, 'Ground two pins up.')
		],
		note: 'The only deck input on the right half of the left edge, away from the toggles.'
	},
	{
		id: 'lid-reed',
		item: 'Lid-detect switch (reed or microswitch)',
		name: 'Lid switch',
		short: 'Lid switch',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: 'switch', to: 29, wire: 'purple', status: P, dir: 'in', note: 'GP22. box.md wants a lid-detect switch to the Pico; it names no pin.' },
			pwr('switch', 28, 'black', P, 'Ground beside it.')
		],
		note: 'Not in parts.mjs yet.'
	},
	{
		id: 'radar',
		item: 'HLK-LD2450 24 GHz radar',
		name: 'Radar LD2450',
		short: 'Radar',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 90,
		docsUrl: 'https://github.com/RBEGamer/HLK-LD2450',
		pins: [
			pwr('5V', 40, 'red', P, 'VBUS, the 5 V from the Pico USB lead. The module needs 4.5 to 5.5 V; VSYS drops a diode and would be marginal.'),
			pwr('GND', 23, 'black', P, 'Beside the UART pins.'),
			{ partPin: 'RX', to: 21, wire: 'green', status: P, dir: 'out', bus: 'uart0', fn: 'UART0 TX', note: 'GP16, UART0 TX, to the radar RX. 3.3 V logic, 256000 baud 8N1.' },
			{ partPin: 'TX', to: 22, wire: 'yellow', status: P, dir: 'in', bus: 'uart0', fn: 'UART0 RX', note: 'GP17, UART0 RX.' }
		],
		note: 'About 90 mA average. No official Hi-Link datasheet was found; range quoted as 6 or 8 m.'
	},
	{
		id: 'buttons',
		item: 'Small momentary buttons, 6–8 mm brass',
		name: 'Small buttons (3)',
		short: 'Buttons',
		phase: 'later',
		board: 'pico',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: 'button 1', to: 24, wire: 'blue', status: P, dir: 'in', note: 'GP18. Jobs still to settle (parts.mjs).' },
			{ partPin: 'button 2', to: 25, wire: 'green', status: P, dir: 'in', note: 'GP19.' },
			{ partPin: 'button 3', to: 26, wire: 'yellow', status: P, dir: 'in', note: 'GP20.' },
			pwr('common', 28, 'black', P, 'Ground two pins down.')
		],
		note: ''
	},
	{
		id: 'strip',
		item: 'SK6812 strip, 5 mm wide, 60/m, ~0.4 m',
		name: 'Light strip (SK6812)',
		short: 'Strip',
		phase: 'later',
		board: 'pico',
		logic: '5v',
		currentMa: 400,
		supply: 'buck',
		docsUrl: null,
		pins: [
			{ partPin: 'DIN', to: 27, wire: 'purple', status: P, dir: 'out', via: 'face-shifter', note: 'GP21. 5 V data from a 3.3 V pin needs a level shifter: the spare CLK channel on the face\'s Pixel Shifter (CLK in, C5 out) would do. That channel is on the Pi side of the board; confirm the grounds are common.' },
			{ partPin: '5V', to: null, wire: 'red', status: P, dir: 'pwr', note: 'From the buck, not the Pico.' },
			{ partPin: 'GND', to: null, wire: 'black', status: P, dir: 'pwr', note: '' }
		],
		note: '24 pixels at 60 mA is 1.4 A at full white; 400 mA assumes it is capped dim. Price and pin labels not checked.'
	},
	// ---- Whole-box view only: power, sound and cabling parts with no header pin ----
	{
		id: 'psu-pi',
		item: 'Official 27 W USB-C power supply',
		name: 'Pi power supply (27 W)',
		short: 'Pi PSU 27 W',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: 'https://www.raspberrypi.com/documentation/computers/raspberry-pi.html#recommended-power-supplies',
		pins: [{ partPin: 'USB-C', to: null, wire: 'red', status: D, dir: 'pwr', note: '5 V, 5 A. The Pi\'s own lead comes in at the left of the back wall (box.md).' }],
		note: 'Raspberry Pi recommends it for the Pi 5; it is what allows 1.6 A to USB.'
	},
	{
		id: 'brick',
		item: '24 V 5 A brick (ALITOVE, 5.5 × 2.1/2.5 mm)',
		name: '24 V 5 A brick',
		short: '24 V brick',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: 'https://www.amazon.com.au/dp/B0CRDWLDJ5',
		pins: [{ partPin: 'DC out', to: null, wire: 'red', status: D, dir: 'pwr', note: 'Outside the box, one lead in (box.md). Match its plug to the printer\'s.' }],
		note: 'Rated 5 A at 24 V; the page sums the 24 V loads against that.'
	},
	{
		id: 'jack',
		item: 'Panel-mount DC jack + inline blade fuse (7.5 A)',
		name: 'Panel DC jack + 7.5 A fuse',
		short: 'DC jack + fuse',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: 'https://core-electronics.com.au/round-panel-mount-55mm21mm-dc-barrel-jack-extension-cable-30cm-long.html',
		pins: [
			{ partPin: 'in', to: null, wire: 'red', status: D, dir: 'pwr', note: 'The 24 V lead comes in through the socket.' },
			{ partPin: 'out (fused)', to: null, wire: 'red', status: D, dir: 'pwr', note: 'The fuse sits straight after the jack, before the Y-split (parts.mjs).' }
		],
		note: 'A short inside the wooden box blows the fuse, not the brick.'
	},
	{
		id: 'splitter',
		item: '24 V 5 A brick (ALITOVE, 5.5 × 2.1/2.5 mm) + DC Y-splitter + 2200 µF capacitor',
		name: 'DC Y-splitter',
		short: 'Y-splitter',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: 'in', to: null, wire: 'red', status: D, dir: 'pwr', note: 'From the fused jack.' },
			{ partPin: 'out A', to: null, wire: 'red', status: D, dir: 'pwr', note: 'To the printer (box.md: split to the printer and, through the divider, the amp).' },
			{ partPin: 'out B', to: null, wire: 'red', status: D, dir: 'pwr', note: 'To the amp, through the divider. The buck taps the same lead.' }
		],
		note: 'Match the printer\'s DC plug (parts.mjs).'
	},
	{
		id: 'cap',
		item: '24 V 5 A brick (ALITOVE, 5.5 × 2.1/2.5 mm) + DC Y-splitter + 2200 µF capacitor',
		name: '2200 µF capacitor',
		short: '2200 µF cap',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [
			{ partPin: '+', to: null, wire: 'red', status: D, dir: 'pwr', note: 'Across the amp\'s 24 V input (box.md: 2200 µF at the amp).' },
			{ partPin: '−', to: null, wire: 'black', status: D, dir: 'pwr', note: 'Mind the polarity. Voltage rating: use 35 V or more (my pick, not in parts.mjs).' }
		],
		note: 'Smooths the amp\'s bass peaks so the printer doesn\'t tick. If it still does, give the amp its own 24 V pack.'
	},
	{
		id: 'amp',
		item: 'Small class-D amp board, 2 channel (TPA3116 / TPA3118 mini)',
		name: 'Class-D amp (TPA3116 mini)',
		short: 'Amp',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		draw: [{ rail: 'v24', mA: 1200 }],
		docsUrl: 'https://www.amazon.com.au/dp/B0H7L64S4C',
		pins: [
			{ partPin: 'IN (line)', to: null, wire: 'green', status: D, dir: 'in', note: 'Line in from the sound card (parts.mjs).' },
			{ partPin: 'DC 24 V', to: null, wire: 'red', status: D, dir: 'pwr', note: 'Off the 24 V lead; the 2200 µF cap sits here.' },
			{ partPin: 'OUT (one ch)', to: null, wire: 'green', status: D, dir: 'out', note: 'One channel drives the SB65; the other is spare (parts.mjs). Screw terminals: check the board has them.' }
		],
		note: '1200 mA at 24 V is an estimate: about 20 W into the SB65 plus idle. The board listing has no reviews yet.'
	},
	{
		id: 'speaker',
		item: 'SB Acoustics SB65WBAC25-4, 2.5" full-range',
		name: 'SB65 speaker',
		short: 'SB65 speaker',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [{ partPin: '+/−', to: null, wire: 'green', status: D, dir: 'in', note: '4 Ω, 20 W rated (parts.mjs). Terminal polarity: check the driver.' }],
		note: 'Mono, in the ~0.9 L chamber with the radiator. No datasheet link found.'
	},
	{
		id: 'radiator',
		item: 'Dayton Audio ND65-PR, 2.5" passive radiator',
		name: 'ND65-PR passive radiator',
		short: 'ND65-PR radiator',
		phase: 'v1',
		board: 'usb',
		view: 'box',
		logic: '3v3',
		currentMa: 0,
		docsUrl: null,
		pins: [],
		note: 'Passive: no wires. It shares the speaker chamber (box.md).'
	}
];

export const wireColours = ['red', 'black', 'yellow', 'green', 'blue', 'white', 'orange', 'purple', 'grey', 'brown', 'ribbon'];

// Pi 5 board connectors for the Whole-box view. Positions are drawn from the Pi 5 layout: only the fan connector's
// place ("upper right, between the 40-pin header and the USB 2.0 ports") is stated in Raspberry Pi's docs; the rest
// is from board photos, so check it against the board.
export const piPorts = [
	{ id: 'usbc', label: 'USB-C power' },
	{ id: 'hdmi0', label: 'micro-HDMI 0' },
	{ id: 'hdmi1', label: 'micro-HDMI 1' },
	{ id: 'cam0', label: 'CAM/DISP 0' },
	{ id: 'cam1', label: 'CAM/DISP 1' },
	{ id: 'usb2a', label: 'USB 2 (a)' },
	{ id: 'usb2b', label: 'USB 2 (b)' },
	{ id: 'usb3a', label: 'USB 3 (a)' },
	{ id: 'usb3b', label: 'USB 3 (b)' },
	{ id: 'eth', label: 'Ethernet' },
	{ id: 'fan', label: 'Fan' },
	{ id: 'header', label: '40-pin header' }
];

// Cables between things that are not header pins. Endpoints are 'partId:partPin' or 'pi:portId'.
// kind sets the colour in the Whole-box view: usb, ribbon, power5, power24, audio, signal.
export const links = [
	{ a: 'printer:USB-B', b: 'pi:usb3b', kind: 'usb', status: P, note: 'Any USB port works; the printer is slow.' },
	{ a: 'pico:micro-USB', b: 'pi:usb2a', kind: 'usb', status: P, note: 'Any USB port works.' },
	{ a: 'respeaker:USB-C', b: 'pi:usb2b', kind: 'usb', status: P, note: 'Any USB port works.' },
	{ a: 'sound-card:USB-A', b: 'pi:usb3a', kind: 'usb', status: P, note: 'Any USB port works.' },
	{ a: 'lid-screen:DSI ribbon', b: 'pi:cam1', kind: 'ribbon', status: D, note: 'Waveshare: DSI1 is the default.' },
	{ a: 'camera:CSI ribbon', b: 'pi:cam0', kind: 'ribbon', status: D, note: 'The Pi 5\'s other ribbon port (box.md).' },
	{ a: 'psu-pi:USB-C', b: 'pi:usbc', kind: 'power5', status: D, note: 'The Pi\'s own lead.' },
	{ a: 'brick:DC out', b: 'jack:in', kind: 'power24', status: D, note: '' },
	{ a: 'jack:out (fused)', b: 'splitter:in', kind: 'power24', status: D, note: '' },
	{ a: 'splitter:out A', b: 'printer:DC in', kind: 'power24', status: D, note: '' },
	{ a: 'splitter:out B', b: 'amp:DC 24 V', kind: 'power24', status: D, note: '' },
	{ a: 'cap:+', b: 'amp:DC 24 V', kind: 'power24', status: D, note: '2200 µF at the amp (box.md).' },
	{ a: 'cap:−', b: 'amp:DC 24 V', kind: 'power24', status: D, note: '' },
	{ a: 'splitter:out B', b: 'buck:VIN', kind: 'power24', status: P, note: 'box.md says "on the 24 V lead" without naming the spot; tapping the amp\'s lead keeps the printer\'s clear.' },
	{ a: 'buck:VOUT', b: 'face:5V', kind: 'power5', status: D, note: '' },
	{ a: 'buck:VOUT', b: 'face:GND', kind: 'power5', status: D, note: '' },
	{ a: 'buck:VOUT', b: 'face-shifter:V', kind: 'power5', status: P, note: '' },
	{ a: 'buck:VOUT', b: 'strip:5V', kind: 'power5', status: P, note: '' },
	{ a: 'buck:VOUT', b: 'strip:GND', kind: 'power5', status: P, note: '' },
	{ a: 'face-shifter:D5 out', b: 'face:DIN', kind: 'signal', status: D, note: '' },
	{ a: 'sound-card:line out', b: 'amp:IN (line)', kind: 'audio', status: D, note: '' },
	{ a: 'amp:OUT (one ch)', b: 'speaker:+/−', kind: 'audio', status: D, note: '' }
];
