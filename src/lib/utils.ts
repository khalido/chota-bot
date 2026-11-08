import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** A thrown value's message, for error text returned to a caller (agent tool
 *  results, API responses, page errors). Inside LogTape calls pass `{ error }` instead. */
export function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
