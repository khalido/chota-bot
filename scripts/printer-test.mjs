#!/usr/bin/env node
/**
 * MUNBYN ITPP098P USB visibility + 3-line print smoke test.
 *
 * macOS-aware: claims the USB interface directly via libusb after detaching
 * the kernel driver (IOUSBHostFamily.kext / CUPS print subsystem). On Linux
 * the same code path works without the detach (no kernel driver claim).
 *
 * node-thermal-printer is used ONLY to build the ESC/POS byte buffer
 * (`getBuffer()`); we don't use its `interface:` connection logic — it has
 * no USB transport, only TCP/file/system-printer.
 *
 * Vendor/product IDs vary per MUNBYN unit. Confirmed on the kit-on-hand:
 *   idVendor=0x0483 (STMicro chip — generic), idProduct=0x5743
 *   USB Product Name = "printer-80", USB Vendor Name = "Printer"
 * Confirm yours with: `ioreg -p IOUSB -l | grep -B 2 -A 20 printer-80`
 *
 * Usage:
 *   node scripts/printer-test.mjs            # check + print
 *   node scripts/printer-test.mjs visible    # check visibility only
 *   node scripts/printer-test.mjs print      # skip check, just print
 */
import { findByIds, getDeviceList } from 'usb';

// Raw ESC/POS bytes — clearer than node-thermal-printer for a smoke test,
// and node-thermal-printer requires an `interface:` in its constructor that
// we don't want to use. The real printer.ts will use node-thermal-printer's
// getBuffer() for richer formatting.
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;
const INIT = Buffer.from([ESC, 0x40]); //  ESC @  : reset to defaults
const CUT = Buffer.from([GS, 0x56, 0x01]); //  GS V 1 : partial cut
const ALIGN_CENTER = Buffer.from([ESC, 0x61, 0x01]);
const ALIGN_LEFT = Buffer.from([ESC, 0x61, 0x00]);
const BOLD_ON = Buffer.from([ESC, 0x45, 0x01]);
const BOLD_OFF = Buffer.from([ESC, 0x45, 0x00]);
function line(s = '') {
	return Buffer.concat([Buffer.from(s, 'ascii'), Buffer.from([LF])]);
}

const VENDOR = 0x0483;
const PRODUCT = 0x5743;

const mode = process.argv[2] ?? 'all';

if (mode === 'visible' || mode === 'all') {
	checkVisibility();
}
if (mode === 'print' || mode === 'all') {
	await runPrint();
}

// ─────────────────────────────────────────────────────────────────

function checkVisibility() {
	console.log('USB devices visible to libusb:\n');
	for (const d of getDeviceList()) {
		const v = d.deviceDescriptor.idVendor.toString(16).padStart(4, '0');
		const p = d.deviceDescriptor.idProduct.toString(16).padStart(4, '0');
		const marker =
			d.deviceDescriptor.idVendor === VENDOR && d.deviceDescriptor.idProduct === PRODUCT
				? '  ← MUNBYN'
				: '';
		console.log(`  vendor=0x${v} product=0x${p}${marker}`);
	}
	console.log('');

	const found = findByIds(VENDOR, PRODUCT);
	if (!found) {
		console.error(
			`✗ Not found at vendor=0x${VENDOR.toString(16)} product=0x${PRODUCT.toString(16)}`
		);
		console.error('  ioreg -p IOUSB -l | grep -B 2 -A 20 printer-80');
		if (mode === 'visible') process.exit(1);
		return false;
	}
	console.log(`✓ Found at vendor=0x${VENDOR.toString(16)} product=0x${PRODUCT.toString(16)}\n`);
	return true;
}

async function runPrint() {
	// 1. Build ESC/POS bytes by hand — see constants at top of file
	const buffer = Buffer.concat([
		INIT,
		ALIGN_CENTER,
		BOLD_ON,
		line('CHOTA TEST'),
		BOLD_OFF,
		ALIGN_LEFT,
		line(),
		line(`time:  ${new Date().toISOString()}`),
		line(`host:  ${process.platform} ${process.arch}`),
		line(),
		ALIGN_CENTER,
		line('OK'),
		line(),
		line(),
		CUT
	]);
	console.log(`Built ${buffer.length}-byte ESC/POS payload.`);

	// 2. Open the USB device + detach the macOS kernel driver if it has it
	const device = findByIds(VENDOR, PRODUCT);
	if (!device) {
		console.error('✗ Device not found at the expected IDs.');
		process.exit(1);
	}

	try {
		device.open();
	} catch (err) {
		console.error('✗ device.open() failed:', err.message);
		console.error('  Try: lsof | grep USB    # see if anything else holds it');
		process.exit(1);
	}
	console.log('✓ Device opened.');

	const iface = device.interface(0);
	if (iface.isKernelDriverActive()) {
		try {
			iface.detachKernelDriver();
			console.log('✓ Detached macOS kernel driver from interface 0.');
		} catch (err) {
			console.error('✗ detachKernelDriver() failed:', err.message);
			console.error('  Mac CUPS may be holding the device. Open System Settings →');
			console.error('  Printers & Scanners and DELETE any auto-added printer.');
			device.close();
			process.exit(1);
		}
	}

	try {
		iface.claim();
		console.log('✓ Claimed interface 0.');
	} catch (err) {
		console.error('✗ iface.claim() failed:', err.message);
		device.close();
		process.exit(1);
	}

	// 3. Find the bulk OUT endpoint (transferType 2 = LIBUSB_TRANSFER_TYPE_BULK)
	const outEndpoint = iface.endpoints.find((ep) => ep.direction === 'out' && ep.transferType === 2);
	if (!outEndpoint) {
		console.error('✗ No bulk OUT endpoint found on interface 0.');
		console.error(
			'  Endpoints found:',
			iface.endpoints.map((e) => `${e.direction}/type${e.transferType}`)
		);
		releaseAndClose(iface, device);
		process.exit(1);
	}
	console.log(`✓ Bulk OUT endpoint at address 0x${outEndpoint.address.toString(16)}.`);

	// 4. Transfer the buffer
	console.log('Sending bytes...');
	await new Promise((resolve, reject) => {
		outEndpoint.transfer(buffer, (err) => (err ? reject(err) : resolve()));
	}).catch((err) => {
		console.error('✗ transfer() failed:', err.message);
		releaseAndClose(iface, device);
		process.exit(1);
	});
	console.log(`✓ Sent ${buffer.length} bytes. Check the paper.`);

	releaseAndClose(iface, device);
}

function releaseAndClose(iface, device) {
	iface.release(true, () => {
		try {
			device.close();
		} catch {
			// ignore
		}
	});
}
