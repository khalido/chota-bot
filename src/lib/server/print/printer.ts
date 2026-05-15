/**
 * MUNBYN ITPP098P (or similar 80mm ESC/POS thermal printer) over raw USB.
 *
 * Two-layer design:
 *   - node-thermal-printer builds the ESC/POS byte buffer (text formatting,
 *     alignment, image dithering — all the protocol-level stuff). We never
 *     use its `interface:` connection (it has no USB transport — only TCP /
 *     file / system-printer). Constructor needs an interface string, so we
 *     pass a dummy `tcp://localhost:0`; we never call `execute()`.
 *   - `usb` package (libusb) sends the buffer to the printer. macOS may
 *     have IOUSBHostFamily attached; we detach + re-attach via try/finally.
 *
 * Thread-safety: a process-level mutex prevents two prints from racing on
 * the same USB endpoint. If a job tries to print while another is in
 * flight, it throws — caller should catch + retry on the next tick.
 *
 * Vendor/product IDs come from `chota.config.ts > printer`. Confirmed for
 * this kit (May 2026): 0x0483:0x5743 (STMicro generic — many MUNBYNs use
 * this). The `0x0416:0x5011` from the original docs was a different SKU.
 */
import { findByIds, type OutEndpoint } from 'usb';
import pkg, { CharacterSet } from 'node-thermal-printer';
import { getConfig } from '$lib/server/config';
import { log, logErr } from '$lib/server/log';
import { wrapLine } from './wrap';

const { printer: ThermalPrinter, types: PrinterTypes } = pkg;
type ThermalPrinterInstance = InstanceType<typeof ThermalPrinter>;

let busy = false;

/**
 * Low-level: build an ESC/POS payload via callback, then transfer it to the
 * printer over raw USB. Use this when you need anything beyond plain text
 * (alignment, bold, images, barcodes, etc.).
 *
 *   await printReceipt(async (p) => {
 *     p.alignCenter().bold(true).println('CHOTA');
 *     p.bold(false).alignLeft();
 *     p.println('hello');
 *     await p.printImage('./dithered.png');   // when we add images
 *     p.cut();
 *   });
 */
export async function printReceipt(
	build: (p: ThermalPrinterInstance) => void | Promise<void>
): Promise<number> {
	if (busy) throw new Error('printer busy — another print is in flight');
	busy = true;
	try {
		const printer = new ThermalPrinter({
			type: PrinterTypes.EPSON,
			interface: 'tcp://localhost:0', // dummy — we never call execute()
			characterSet: CharacterSet.PC437_USA,
			removeSpecialCharacters: false,
			lineCharacter: '-'
		});
		await build(printer);
		const buffer = printer.getBuffer();
		await sendToUsb(buffer);
		log('printer', `sent ${buffer.length} bytes`);
		return buffer.length;
	} finally {
		busy = false;
	}
}

export interface PrintTextOpts {
	/** Built-in ESC/POS font. A = 12x24 (~46 cols), B = 9x17 (~62 cols, crisper). Default 'A'. */
	font?: 'A' | 'B';
	/** Mixed mode: headers (CHOTA / "NN SECTION") in Font A, body lines in Font B. Overrides `font`. */
	mix?: boolean;
}

const SECTION_RE = /^\d{2} [A-Z][A-Z .-]*$/;
// Conservative column counts for an 80mm / 576-dot head. The "test" print's
// ruler line tells you the real numbers; bump these if your unit fits more.
const COLS_A = 46;
const COLS_B = 62;

/**
 * Print plain text and cut. Use this from the morning-print job. Each input
 * line is word-wrapped to the active font's column width, so the composer can
 * emit long semantic lines without caring about paper width.
 */
export async function printText(text: string, opts: PrintTextOpts = {}): Promise<number> {
	return printReceipt((p) => {
		const lines = text.split('\n');
		if (opts.mix) {
			let cur: 'A' | 'B' | null = null;
			for (const line of lines) {
				const isHead = line === 'CHOTA' || SECTION_RE.test(line);
				const want: 'A' | 'B' = isHead ? 'A' : 'B';
				if (want !== cur) {
					want === 'A' ? p.setTypeFontA() : p.setTypeFontB();
					cur = want;
				}
				for (const w of wrapLine(line, isHead ? COLS_A : COLS_B)) p.println(w);
			}
		} else {
			const fontB = opts.font === 'B';
			fontB ? p.setTypeFontB() : p.setTypeFontA();
			const cols = fontB ? COLS_B : COLS_A;
			for (const line of lines) for (const w of wrapLine(line, cols)) p.println(w);
		}
		p.cut();
	});
}

/**
 * Print a PNG (passed as a file Buffer — not a path) as a raster image, then
 * cut. node-thermal-printer decodes + dithers + ESC/POS-encodes it. Use this
 * with `renderReceiptPng()` for the "designed" print path.
 */
export async function printPng(png: Buffer): Promise<number> {
	return printReceipt(async (p) => {
		await p.printImageBuffer(png);
		p.cut();
	});
}

// ────────────────────────────────────────────────────────────────────────────
// USB transport — open / detach / claim / transfer / release / close
// ────────────────────────────────────────────────────────────────────────────

async function sendToUsb(buffer: Buffer): Promise<void> {
	const cfg = getConfig().printer;
	if (!cfg?.vendorId || !cfg?.productId) {
		throw new Error('Set printer.vendorId + printer.productId in chota.config.ts');
	}

	const device = findByIds(cfg.vendorId, cfg.productId);
	if (!device) {
		throw new Error(
			`Printer not found at vendor=0x${cfg.vendorId.toString(16)} product=0x${cfg.productId.toString(16)}. Check USB cable + power.`
		);
	}

	device.open();
	const iface = device.interface(0);
	let detached = false;

	try {
		if (iface.isKernelDriverActive()) {
			iface.detachKernelDriver();
			detached = true;
			log('printer', 'detached macOS kernel driver');
		}
		iface.claim();

		const out = iface.endpoints.find(
			(e) => e.direction === 'out' && e.transferType === 2
		) as OutEndpoint | undefined;
		if (!out) throw new Error('No bulk OUT endpoint on interface 0');

		await new Promise<void>((resolve, reject) => {
			out.transfer(buffer, (err: unknown) => (err ? reject(err) : resolve()));
		});
	} finally {
		try {
			await new Promise<void>((resolve) => iface.release(true, () => resolve()));
		} catch (err) {
			logErr('printer', 'iface.release failed:', err);
		}
		if (detached) {
			try {
				iface.attachKernelDriver();
			} catch (err) {
				logErr('printer', 'attachKernelDriver failed (harmless on Linux):', err);
			}
		}
		try {
			device.close();
		} catch (err) {
			logErr('printer', 'device.close failed:', err);
		}
	}
}
