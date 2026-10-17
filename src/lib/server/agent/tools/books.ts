/**
 * book agent-tool — "tell me about this book", "does the library have X".
 *
 * Wraps `$lib/server/tools/books` (`lookupBook`: Google Books / Open Library,
 * the City of Sydney Library catalogue, one Exa search). Returns a compact
 * shape: the model answers in a line or two and links the catalogue.
 */
import { tool } from 'ai';
import { z } from 'zod';
import { lookupBook } from '$lib/server/tools/books';

export const bookTool = tool({
	description:
		'Look up a book: what it is about, reader age, how it was received, and whether the City of Sydney Library has it (copies on the shelf, at which branches). Use for "tell me about <book>", "is <book> good for a 9 year old", "does the library have <book>". Takes ~8s the first time.',
	inputSchema: z.object({
		query: z.string().describe('Book title, plus the author if known: "wonder palacio".')
	}),
	execute: async ({ query }) => {
		const info = await lookupBook(query);
		if (!info) return { match: null };
		const { book, library, about } = info;
		return {
			match: {
				title: book.title,
				authors: book.authors,
				year: book.year,
				pages: book.pages,
				rating: book.rating ?? null,
				about: about?.blurb || book.description.slice(0, 400),
				ageGuide: about?.ageGuide ?? library?.titles[0]?.audienceNote ?? null,
				reception: about?.reception ?? null
			},
			library: library && {
				held: library.titles.length > 0,
				onShelf: library.onShelf,
				totalCopies: library.total,
				waiting: library.waiting,
				nearOnShelf: library.nearby.map((c) => c.branch),
				otherBranchesOnShelf: library.branches,
				url: library.searchUrl
			}
		};
	}
});
