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
 * flight, it throws — caller should catch + retry on the next tick. A status
 * read (`readPrinterStatus`, the printer-check job) never blocks a print: it
 * skips while one is running, and a print waits out the short read.
 *
 * Every USB transfer has a timeout. libusb's default is none, so a printer
 * that stopped taking data (paper out, cover open) used to hold the mutex for
 * the life of the process.
 *
 * Vendor/product IDs come from `chota.config.ts > printer`. Confirmed for
 * this kit (May 2026): 0x0483:0x5743 (STMicro generic — many MUNBYNs use
 * this). The `0x0416:0x5011` from the original docs was a different SKU.
 */
import { findByIds, usb, type InEndpoint, type Interface, type OutEndpoint } from 'usb';
import pkg, { CharacterSet } from 'node-thermal-printer';
import { getConfig } from '#lib/server/config.ts';
import { log, logErr } from '#lib/server/log.ts';
import { wrapLine } from './wrap';

const { printer: ThermalPrinter, types: PrinterTypes } = pkg;
type ThermalPrinterInstance = InstanceType<typeof ThermalPrinter>;

let busy = false;
/** A status read in flight; a print waits for it rather than failing as busy. */
let statusRead: Promise<unknown> | null = null;

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
		await statusRead?.catch(() => {});
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
					if (want === 'A') p.setTypeFontA();
					else p.setTypeFontB();
					cur = want;
				}
				for (const w of wrapLine(line, isHead ? COLS_A : COLS_B)) p.println(w);
			}
		} else {
			const fontB = opts.font === 'B';
			if (fontB) p.setTypeFontB();
			else p.setTypeFontA();
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
// Status — ask the printer how it is (ESC/POS real-time status, DLE EOT n)
// ────────────────────────────────────────────────────────────────────────────

export interface PrinterStatus {
	/** Nothing stopping a print. */
	ok: boolean;
	/** What stops a print, in plain words: "paper out", "cover open", "not connected". */
	problems: string[];
	/** The roll is near its end (only on printers with that sensor). Not a problem yet. */
	paperLow: boolean;
	/** The four status bytes as hex, for the log and for a byte we can't read. */
	raw: string;
}

const hex = (b: number) => `0x${b.toString(16).padStart(2, '0')}`;

/**
 * Turn the four DLE EOT replies (n = 1 printer, 2 offline cause, 3 error,
 * 4 paper sensor) into problems. Bit meanings are Epson's; every status byte
 * has bits 1 and 4 set and bits 0 and 7 clear, so anything else is reported
 * as it came rather than guessed at. Read off this MUNBYN on the Pi (10 Nov
 * 2026): 16 12 12 12 online with paper, 1e 36 12 72 cover open, 1e 32 12 72
 * roll out with the cover shut.
 */
export function decodeStatus(bytes: (number | undefined)[]): PrinterStatus {
	const raw = bytes.map((b) => (b === undefined ? '--' : hex(b))).join(' ');
	const [printer, offline, error, paper] = bytes;
	const problems: string[] = [];
	const odd = bytes.some((b) => b === undefined || (b & 0x93) !== 0x12);
	if (odd) problems.push(`status not understood (${raw})`);
	else {
		// With the cover up the paper sensor reads empty too, so it says nothing
		// about the roll: report the cover alone.
		const coverOpen = (offline! & 0x04) !== 0;
		if (coverOpen) problems.push('cover open');
		else if (paper! & 0x60 || offline! & 0x20) problems.push('paper out');
		if (error! & 0x08) problems.push('cutter jammed');
		if (error! & 0x20) problems.push('needs a power cycle (unrecoverable error)');
		if (error! & 0x40) problems.push('overheated, waiting to cool');
		if (offline! & 0x40 && !(error! & 0x68)) problems.push('error');
		if (printer! & 0x08 && problems.length === 0) problems.push(`offline (${raw})`);
	}
	return {
		ok: problems.length === 0,
		problems,
		paperLow: !odd && (paper! & 0x0c) !== 0 && (paper! & 0x60) === 0,
		raw
	};
}

/** How long one status question may take. The MUNBYN answers in about 1 ms. */
const STATUS_TIMEOUT_MS = 1_000;

/**
 * Ask the printer for its status. Resolves null while a print is running (the
 * check can wait; the print can't). A printer that isn't on the bus comes back
 * as the problem "not connected" rather than a throw, so the caller alerts on
 * it like any other fault. Uses no paper.
 */
export async function readPrinterStatus(): Promise<PrinterStatus | null> {
	if (busy || statusRead) return null;
	const read = (async (): Promise<PrinterStatus> => {
		try {
			return await withPrinter(async (iface) => {
				const out = bulk(iface, 'out');
				const inn = bulk(iface, 'in');
				if (!out) throw new Error('No bulk OUT endpoint on interface 0');
				if (!inn)
					throw new Error("No bulk IN endpoint on interface 0 — this printer can't report status");
				out.timeout = STATUS_TIMEOUT_MS;
				inn.timeout = 200;
				// A reply left unread by an earlier session would answer the wrong question.
				for (let i = 0; i < 8 && (await receive(inn))?.length; i++);
				const bytes: (number | undefined)[] = [];
				for (const n of [1, 2, 3, 4]) {
					await transfer(out, Buffer.from([0x10, 0x04, n]));
					let reply: Buffer | null = null;
					for (let i = 0; i < 5 && !reply?.length; i++) reply = await receive(inn);
					bytes.push(reply?.[0]);
				}
				return decodeStatus(bytes);
			});
		} catch (err) {
			if (err instanceof PrinterNotFound) {
				return {
					ok: false,
					problems: ['not connected (check power and the USB cable)'],
					paperLow: false,
					raw: ''
				};
			}
			throw err;
		}
	})();
	statusRead = read;
	try {
		return await read;
	} finally {
		statusRead = null;
	}
}

// ────────────────────────────────────────────────────────────────────────────
// USB transport — open / detach / claim / transfer / release / close
// ────────────────────────────────────────────────────────────────────────────

class PrinterNotFound extends Error {}

/** The interface's bulk endpoint in one direction, if it has one. */
function bulk(iface: Interface, direction: 'out'): OutEndpoint | undefined;
function bulk(iface: Interface, direction: 'in'): InEndpoint | undefined;
function bulk(iface: Interface, direction: 'in' | 'out') {
	return iface.endpoints.find((e) => e.direction === direction && e.transferType === 2);
}

const transfer = (out: OutEndpoint, buffer: Buffer) =>
	new Promise<void>((resolve, reject) => {
		out.transfer(buffer, (err: unknown) => (err ? reject(err) : resolve()));
	});

/** One read; null when nothing arrived inside the endpoint's timeout. */
const receive = (inn: InEndpoint) =>
	new Promise<Buffer | null>((resolve) => {
		inn.transfer(64, (err, data) => resolve(err || !data ? null : data));
	});

/** Time allowed for a print's bytes to go: a base, plus 1 s per 2 KB (the
 *  printer takes data only as fast as it prints). An 80 KB sheet gets 100 s. */
const printTimeoutMs = (bytes: number) => 60_000 + Math.ceil(bytes / 2);

async function sendToUsb(buffer: Buffer): Promise<void> {
	await withPrinter(async (iface) => {
		const out = bulk(iface, 'out');
		if (!out) throw new Error('No bulk OUT endpoint on interface 0');
		out.timeout = printTimeoutMs(buffer.length);
		try {
			await transfer(out, buffer);
		} catch (err) {
			if ((err as { errno?: number }).errno === usb.LIBUSB_TRANSFER_TIMED_OUT) {
				throw new Error(
					`printer stopped taking data after ${Math.round(out.timeout / 1000)} s — paper out, cover open or jammed?`,
					{ cause: err }
				);
			}
			throw err;
		}
	});
}

/** Open the printer, claim interface 0, run `fn`, and always let go again. */
async function withPrinter<T>(fn: (iface: Interface) => Promise<T>): Promise<T> {
	const cfg = getConfig().printer;
	if (!cfg?.vendorId || !cfg?.productId) {
		throw new Error('Set printer.vendorId + printer.productId in chota.config.ts');
	}

	const device = findByIds(cfg.vendorId, cfg.productId);
	if (!device) {
		throw new PrinterNotFound(
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
		return await fn(iface);
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
