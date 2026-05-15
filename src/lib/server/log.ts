/**
 * Tiny scoped logger. Plain console.* under the hood, prefixed with a
 * Sydney-local timestamp + scope. Convention:
 *
 *   log('bus', '5 departures fetched')
 *   → 10:42:22 [bus] 5 departures fetched
 *
 * Easy to grep one tool's output, easy to scan a tail. LogTape is the planned
 * replacement (see docs/logging.md) — same callsite contract; just rewrite
 * this file when it lands.
 */

const TIME_FMT = new Intl.DateTimeFormat('en-AU', {
	timeZone: 'Australia/Sydney',
	hour: '2-digit',
	minute: '2-digit',
	second: '2-digit',
	hour12: false
});

function ts(): string {
	return TIME_FMT.format(new Date());
}

export function log(scope: string, ...args: unknown[]): void {
	console.log(`${ts()} [${scope}]`, ...args);
}

export function logErr(scope: string, ...args: unknown[]): void {
	console.error(`${ts()} [${scope}]`, ...args);
}

/**
 * Time an async operation and log how long it took. Useful for spotting
 * slow tools in the page-load waterfall.
 *
 *   const events = await time('calendar', 'getCalendar week', () => getCalendar(...));
 */
export async function time<T>(scope: string, label: string, fn: () => Promise<T>): Promise<T> {
	const start = performance.now();
	try {
		const result = await fn();
		log(scope, `${label} ok in ${Math.round(performance.now() - start)}ms`);
		return result;
	} catch (err) {
		logErr(scope, `${label} failed in ${Math.round(performance.now() - start)}ms:`, err);
		throw err;
	}
}

export { ts };
