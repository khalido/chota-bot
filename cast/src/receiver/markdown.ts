// The text block's markdown-ish: "# heading", "- bullet", blank-line paragraphs, **bold**, *italic*, `code`. Parsed to
// a tree the component renders as elements, so sender text never becomes HTML.
export type Span = { kind: 'text' | 'bold' | 'italic' | 'code'; text: string };
export type Para =
	{ kind: 'heading' | 'para'; spans: Span[] } | { kind: 'bullets'; items: Span[][] };

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`)/g;

export function spans(line: string): Span[] {
	return line
		.split(INLINE)
		.filter(Boolean)
		.map((s): Span => {
			if (s.startsWith('**') && s.endsWith('**') && s.length > 4)
				return { kind: 'bold', text: s.slice(2, -2) };
			if (s.startsWith('`') && s.endsWith('`') && s.length > 2)
				return { kind: 'code', text: s.slice(1, -1) };
			if (s.startsWith('*') && s.endsWith('*') && s.length > 2)
				return { kind: 'italic', text: s.slice(1, -1) };
			return { kind: 'text', text: s };
		});
}

export function markdown(src: string): Para[] {
	const out: Para[] = [];
	let para: string[] = [];
	const flush = () => {
		if (para.length) out.push({ kind: 'para', spans: spans(para.join(' ')) });
		para = [];
	};
	for (const raw of src.split(/\r?\n/)) {
		const line = raw.trim();
		const bullet = /^[-*•]\s+(.*)$/.exec(line);
		const heading = /^#{1,6}\s+(.*)$/.exec(line);
		if (!line) flush();
		else if (heading) {
			flush();
			out.push({ kind: 'heading', spans: spans(heading[1]) });
		} else if (bullet) {
			flush();
			const last = out.at(-1);
			if (last?.kind === 'bullets') last.items.push(spans(bullet[1]));
			else out.push({ kind: 'bullets', items: [spans(bullet[1])] });
		} else para.push(line);
	}
	flush();
	return out;
}
