/**
 * Markdown (what the agent writes) → WhatsApp's own formatting. WhatsApp has
 * *bold*, _italic_, ~strike~ and ```mono```, no headings, tables or link
 * syntax. A long URL in the middle of a sentence reads badly (WhatsApp shows
 * and previews it whole), so links become footnotes: "Tempe [1]" in the text,
 * "[1] https://…" at the end. Headings become bold lines.
 */
export function toWhatsApp(md: string): string {
	const notes: string[] = [];
	const body = md
		// Fenced code stays as WhatsApp mono.
		.replace(/```[a-z]*\n([\s\S]*?)```/g, '```$1```')
		// [text](url) → text [n]; a link whose text is its url stays bare.
		// The url may hold one level of brackets (…/Foo_(film)).
		.replace(/\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)/g, (_, text: string, url: string) => {
			if (text === url) return url;
			let n = notes.indexOf(url) + 1;
			if (!n) n = notes.push(url);
			return `${text} [${n}]`;
		});
	const formatted = body
		// # Heading → *Heading*
		.replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
		// **bold** / __bold__ → *bold* (after headings, so they don't double up)
		.replace(/\*\*(.+?)\*\*/g, '*$1*')
		.replace(/__(.+?)__/g, '*$1*')
		// ~~strike~~ → ~strike~
		.replace(/~~(.+?)~~/g, '~$1~')
		// List markers "- " / "* " → "• "
		.replace(/^(\s*)[-*]\s+/gm, '$1• ');
	if (!notes.length) return formatted;
	return `${formatted}\n\n${notes.map((url, i) => `[${i + 1}] ${url}`).join('\n')}`;
}
