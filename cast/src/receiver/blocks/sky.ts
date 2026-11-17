// The weather block's mood: which sky a condition is, and its colour. Plain words in, so a sender that only sends
// "Showers" or "Partly cloudy" still gets the right one.
export type Sky = 'sun' | 'partly' | 'cloud' | 'rain' | 'storm' | 'snow' | 'fog' | 'night';

/** `hour` 0–24 in the theme's zone: a clear sky after dark is night. */
export function skyOf(condition: string, hour: number): Sky {
	const c = condition.toLowerCase();
	const dark = hour < 6 || hour >= 19;
	if (/thunder|storm|lightning/.test(c)) return 'storm';
	if (/snow|sleet|hail|flurr/.test(c)) return 'snow';
	if (/rain|shower|drizzle/.test(c)) return 'rain';
	if (/fog|mist|haze|smoke|dust/.test(c)) return 'fog';
	if (
		/partly|mostly (sunny|clear)|few clouds|some clouds|scattered|periodic|intermittent|(clear|sunny) with/.test(
			c
		)
	)
		return dark ? 'night' : 'partly';
	if (/cloud|overcast|grey|gray/.test(c)) return 'cloud';
	return dark ? 'night' : 'sun';
}

/** The condition's words, coloured by sky: warm for sun, cool for rain. Dim enough for OLED. */
export const SKY_TEXT: Record<Sky, string> = {
	sun: 'text-amber-200/90',
	partly: 'text-amber-100/80',
	cloud: 'text-neutral-300',
	rain: 'text-sky-300/90',
	storm: 'text-violet-300/85',
	snow: 'text-sky-100/90',
	fog: 'text-neutral-400',
	night: 'text-indigo-200/80'
};
