// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitize } from './sanitize.ts';

describe('sanitize', () => {
	it('keeps a leading <style> and plain markup', () => {
		const out = sanitize('<style>h1{color:red}</style><h1 class="big" style="margin:0">Hi</h1>');
		expect(out).toContain('<style>h1{color:red}</style>');
		expect(out).toContain('<h1 class="big" style="margin:0">Hi</h1>');
	});

	it('removes scripts, event handlers and javascript: URLs', () => {
		const out = sanitize(
			'<script>alert(1)</script><img src="https://x.test/a.png" onerror="alert(1)"><a href="javascript:alert(1)">x</a><svg><script>alert(1)</script><circle onload="x()" r="4"/></svg>'
		);
		expect(out).not.toMatch(/script|onerror|onload|javascript:/i);
		expect(out).toContain('src="https://x.test/a.png"');
		expect(out).toContain('<circle');
	});

	it('removes frames, objects, forms and document-level tags', () => {
		const out = sanitize(
			'<iframe src="https://x.test"></iframe><object data="x"></object><embed src="x"><form><input></form><link rel="stylesheet" href="https://x.test/a.css"><meta http-equiv="refresh" content="0"><base href="https://x.test/">'
		);
		expect(out).not.toMatch(/iframe|object|embed|form|input|link|meta|base/i);
	});

	it('allows https: and data:image/ URLs only', () => {
		expect(sanitize('<img src="http://x.test/a.png">')).not.toContain('http://');
		expect(sanitize('<img src="data:text/html;base64,PHA+">')).not.toContain('data:text');
		expect(sanitize('<img src="data:image/png;base64,iVBORw0KGgo=">')).toContain('data:image/png');
	});
});
