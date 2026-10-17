/** One book as a metadata source describes it, normalised across sources. */
export interface BookHit {
	source: 'google' | 'openlibrary';
	title: string;
	subtitle?: string;
	authors: string[];
	/** First publication year where the source knows it, else this edition's. */
	year: number | null;
	pages: number | null;
	/** Google categories or Open Library subjects, a handful at most. */
	categories: string[];
	/** Publisher blurb, plain text. */
	description: string;
	isbn13: string | null;
	/** Reader rating out of 5 and how many ratings (Open Library). */
	rating?: { average: number; count: number };
	coverUrl: string | null;
	link: string;
}
