/**
 * Receipt text -> PNG renderer (the *fallback* path).
 *
 * The primary "designed print" is a headless screenshot of the `<BriefSheet>`
 * HTML (see snapshot.ts). This canvas renderer is what runs when that path is
 * unavailable (no `agent-browser`), and it's also how the `test` ruler sheet
 * gets rendered (it has no HTML page). Fixed layout — no tuning knobs; if the
 * fallback ever needs polish, do it here.
 *
 * Thermal fonts are dot-matrix bitmaps you can't replace, so we rasterize at
 * the print head's native width (576) and let node-thermal-printer dither it.
 * Thin strokes come out faint, so body text uses IBM Plex Mono **Medium** and
 * headers use **Bold**.
 *
 * Layout heuristics on the plain-text payload:
 *   - with `masthead: true`, line 0 is the date header ("Monday 12 May", maybe
 *     with a right-aligned name suffix we drop here) -> a band: big date left,
 *     the Chota mark right, a solid rule under.
 *   - /^\d\d [A-Z ...]+$/  -> a section header (bold + dashed underline)
 *   - everything else      -> body, auto-wrapped to the column count.
 */
import { createCanvas, GlobalFonts, type SKRSContext2D } from '@napi-rs/canvas';
import { join } from 'node:path';
import { wrapLine } from './wrap';

// Fixed layout (576px = the 80mm head @ 203dpi).
const WIDTH = 576;
const FONT_SIZE = 20;
const LINE_HEIGHT = Math.round(FONT_SIZE * 1.4);
const PADDING = 16;

// ── Fonts: bundled IBM Plex Mono (OFL). Registered once at module load. ─────
const FONTS_DIR = join(process.cwd(), 'static', 'fonts');
const FAM = {
	regular: 'IBM Plex Mono',
	medium: 'IBM Plex Mono Medium',
	semibold: 'IBM Plex Mono SemiBold',
	bold: 'IBM Plex Mono Bold'
} as const;
const BODY_FAMILY = FAM.medium;
const HEAD_FAMILY = FAM.bold;
let fontsReady = false;
function ensureFonts() {
	if (fontsReady) return;
	GlobalFonts.registerFromPath(join(FONTS_DIR, 'IBMPlexMono-Regular.ttf'), FAM.regular);
	GlobalFonts.registerFromPath(join(FONTS_DIR, 'IBMPlexMono-Medium.ttf'), FAM.medium);
	GlobalFonts.registerFromPath(join(FONTS_DIR, 'IBMPlexMono-SemiBold.ttf'), FAM.semibold);
	GlobalFonts.registerFromPath(join(FONTS_DIR, 'IBMPlexMono-Bold.ttf'), FAM.bold);
	fontsReady = true;
}

export interface RenderOpts {
	/** Treat line 0 as the date masthead (big date + Chota mark + rule). Default false. */
	masthead?: boolean;
}

type LineKind = 'header' | 'body';

function isSectionHeader(line: string): boolean {
	return /^\d{2} [A-Z][A-Z .-]*$/.test(line);
}

/** Render `text` (newline-separated) to a PNG buffer. Long lines wrap to fit. */
export function renderReceiptPng(text: string, opts: RenderOpts = {}): Buffer {
	ensureFonts();

	// Peel off line 0 as the date masthead (drop any right-aligned name suffix).
	const rawLines = text.replace(/\t/g, '    ').split('\n');
	let band: { date: string } | null = null;
	if (opts.masthead) {
		const head = rawLines.shift() ?? '';
		band = { date: head.split(/\s{2,}/)[0].trim() };
	}

	// Column capacity (monospace advance).
	const probe = createCanvas(8, 8).getContext('2d');
	probe.font = `${FONT_SIZE}px "${BODY_FAMILY}"`;
	const adv = probe.measureText('0').width || FONT_SIZE * 0.6;
	const cols = Math.max(8, Math.floor((WIDTH - 2 * PADDING) / adv));

	// Layout pass: classify + wrap body lines.
	const display: { text: string; kind: LineKind }[] = [];
	for (const raw of rawLines) {
		if (isSectionHeader(raw)) display.push({ text: raw, kind: 'header' });
		else for (const w of wrapLine(raw, cols)) display.push({ text: w, kind: 'body' });
	}

	const headExtra = Math.round(FONT_SIZE * 0.4); // room for the dashed underline
	const dateSize = Math.round(FONT_SIZE * 1.7);
	const bandH = band ? Math.round(dateSize * 1.25) : 0;

	let h = PADDING + bandH;
	for (const d of display) h += d.kind === 'header' ? LINE_HEIGHT + headExtra : LINE_HEIGHT;
	h += PADDING;

	const canvas = createCanvas(WIDTH, h);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, WIDTH, h);
	ctx.fillStyle = '#000000';
	ctx.textBaseline = 'alphabetic';

	const left = PADDING;
	const right = WIDTH - PADDING;
	let y = PADDING;

	// ── Header band: big date left, graphic mark right, rule under. ─────────
	if (band) {
		ctx.font = `${dateSize}px "${HEAD_FAMILY}"`;
		ctx.fillText(band.date, left, y + Math.round(dateSize * 0.86));
		drawChotaMark(ctx, right, y, bandH);
		ctx.fillRect(left, y + bandH - 3, right - left, 2);
		y += bandH;
	}

	// ── Body + section headers ──────────────────────────────────────────────
	for (const d of display) {
		y += LINE_HEIGHT;
		if (d.kind === 'header') {
			ctx.font = `${FONT_SIZE}px "${HEAD_FAMILY}"`;
			drawMono(ctx, d.text, left, y - Math.round(FONT_SIZE * 0.22), adv);
			ctx.save();
			ctx.strokeStyle = '#000000';
			ctx.lineWidth = 2;
			ctx.setLineDash([4, 3]);
			ctx.beginPath();
			const uy = y + Math.round(headExtra * 0.45);
			ctx.moveTo(left, uy);
			ctx.lineTo(right, uy);
			ctx.stroke();
			ctx.restore();
			y += headExtra;
		} else {
			ctx.font = `${FONT_SIZE}px "${BODY_FAMILY}"`;
			drawMono(ctx, d.text, left, y - Math.round(FONT_SIZE * 0.22), adv);
		}
	}

	return canvas.toBuffer('image/png');
}

/**
 * Draw with a forced fixed advance per char — guards column alignment against
 * the odd glyph or a fallback font kicking in.
 */
function drawMono(ctx: SKRSContext2D, s: string, x: number, y: number, adv: number) {
	let cx = x;
	for (const ch of s) {
		if (ch !== ' ') ctx.fillText(ch, cx, y);
		cx += adv;
	}
}

/**
 * Chota's mark in the masthead's top-right — a black "energy badge": rounded
 * slab, white inner keyline, a bold 4-point sparkle plus a couple of accent
 * sparkles. Purely graphic (no wordmark). Right-aligned to `rightEdge`,
 * vertically centred in `[bandTop, bandTop+bandH]`.
 */
function drawChotaMark(ctx: SKRSContext2D, rightEdge: number, bandTop: number, bandH: number) {
	const size = Math.round(bandH * 0.94);
	const x = rightEdge - size;
	const yTop = bandTop + Math.round((bandH - size) / 2);
	const cx = x + size / 2;
	const cy = yTop + size / 2;

	roundRectPath(ctx, x, yTop, size, size, Math.round(size * 0.24));
	ctx.fillStyle = '#000000';
	ctx.fill();

	const inset = Math.max(2, Math.round(size * 0.06));
	roundRectPath(
		ctx,
		x + inset,
		yTop + inset,
		size - inset * 2,
		size - inset * 2,
		Math.round(size * 0.16)
	);
	ctx.strokeStyle = '#ffffff';
	ctx.lineWidth = Math.max(1.5, size * 0.035);
	ctx.stroke();

	ctx.fillStyle = '#ffffff';
	fourPointStar(ctx, cx - size * 0.04, cy + size * 0.02, size * 0.4, size * 0.16);
	ctx.fill();
	fourPointStar(ctx, x + size * 0.76, yTop + size * 0.26, size * 0.13, size * 0.045);
	ctx.fill();
	ctx.beginPath();
	ctx.arc(x + size * 0.26, yTop + size * 0.74, size * 0.045, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#000000';
}

/** 4-point "sparkle" star path: outer points N/E/S/W at radius R, inner vertices on the diagonals at radius r. */
function fourPointStar(ctx: SKRSContext2D, cx: number, cy: number, R: number, r: number) {
	ctx.beginPath();
	for (let i = 0; i < 8; i++) {
		const a = (i * Math.PI) / 4 - Math.PI / 2;
		const rad = i % 2 === 0 ? R : r;
		const px = cx + Math.cos(a) * rad;
		const py = cy + Math.sin(a) * rad;
		if (i === 0) ctx.moveTo(px, py);
		else ctx.lineTo(px, py);
	}
	ctx.closePath();
}

function roundRectPath(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}
