// Keep the TV from going to its screensaver while the board shows: the Screen Wake Lock, asked for again whenever
// the page shows (the browser drops it when the page hides). `awakeState()` goes in the pong.
// No silent-video fallback: on the Streamer a playing <video> froze the screen on the frame where it started
// (the page drew the board underneath, the TV kept showing the waiting clock).
let lock: WakeLockSentinel | undefined;
let lockState = 'not tried';

async function requestLock() {
	if (!('wakeLock' in navigator)) return void (lockState = 'unsupported');
	if (document.visibilityState !== 'visible' || (lock && !lock.released)) return;
	try {
		lock = await navigator.wakeLock.request('screen');
		lockState = 'held';
		lock.addEventListener('release', () => (lockState = 'released'));
	} catch (e) {
		lockState = `refused: ${(e as Error).name}`;
	}
}

export function keepAwake() {
	requestLock();
	document.addEventListener('visibilitychange', requestLock);
}

export const awakeState = () => `lock ${lockState}`;
