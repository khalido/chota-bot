// Sender HTML for an HTML screen: markup and styles only. Scripts, event handlers, frames, forms and anything that
// navigates or loads a document are removed; the result goes into a Shadow DOM, and the CSP backs this up.
import createDOMPurify, { type Config } from 'dompurify';
import { isImageUrl } from './schema.ts';

const URL_ATTRS = new Set(['src', 'href', 'xlink:href', 'poster', 'background']);

const PURIFY: Config = {
	// A leading <style> would otherwise be dropped as part of <head>.
	FORCE_BODY: true,
	USE_PROFILES: { html: true, svg: true, svgFilters: true },
	ADD_TAGS: ['style'],
	FORBID_TAGS: [
		'script',
		'iframe',
		'frame',
		'frameset',
		'object',
		'embed',
		'form',
		'input',
		'button',
		'textarea',
		'select',
		'link',
		'meta',
		'base',
		'audio',
		'video',
		'source',
		'track',
		'portal',
		'noscript',
		'template'
	],
	FORBID_ATTR: ['srcset', 'ping', 'action', 'formaction', 'target'],
	// A first pass; the hook below applies the exact rule.
	ALLOWED_URI_REGEXP: /^(?:https:|data:image\/|#)/i
};

let purify: ReturnType<typeof createDOMPurify> | undefined;

export function sanitize(html: string, win: Window & typeof globalThis = window): string {
	if (!purify) {
		purify = createDOMPurify(win);
		// The image block's rule for every URL (DOMPurify alone lets any data: URL through on <img>); #fragments too.
		purify.addHook('uponSanitizeAttribute', (_node, a) => {
			if (
				URL_ATTRS.has(a.attrName) &&
				!(isImageUrl(a.attrValue.trim()) || a.attrValue.trim().startsWith('#'))
			)
				a.keepAttr = false;
		});
	}
	return purify.sanitize(html, PURIFY) as string;
}
