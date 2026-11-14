<!--
  /tv — the page the living-room TV shows as chota's Cast receiver (app ID in
  docs; registered unpublished, URL http://<Pi IP>/tv). For now it's the
  proving page: it shows the screen it was given, each remote key and how long
  it has been up, and reports them to /tv/probe so the test can be read from
  the Pi's log. Plan: the TV view of the Chota Map.

  Google's receiver SDK must be on the page for the Cast session to start, and
  the hidden <cast-media-player> is what makes remote keys arrive as keydown
  events on Google TV devices (seen on Chromecast with Google TV; checking it
  on the Streamer is the point of this page).
-->
<script lang="ts">
	type Key = { key: string; code: string; at: string };

	let screen = $state('');
	let started = $state(Date.now());
	let now = $state(Date.now());
	let keys = $state<Key[]>([]);
	let cast = $state('not started');

	const report = (what: object) =>
		fetch('/tv/probe', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(what)
		}).catch(() => {});

	function uptime(ms: number): string {
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m ${s % 60}s`;
	}

	$effect(() => {
		screen = `${innerWidth}×${innerHeight} at ×${devicePixelRatio} · ${navigator.userAgent}`;
		started = now = Date.now();
		report({ event: 'loaded', screen });

		const tick = setInterval(() => (now = Date.now()), 1000);
		// Every 5 minutes: still alive, for measuring how long the receiver stays up.
		const alive = setInterval(
			() => report({ event: 'alive', up: uptime(Date.now() - started) }),
			5 * 60_000
		);

		const onKey = (e: KeyboardEvent) => {
			const k = { key: e.key, code: e.code, at: new Date().toLocaleTimeString() };
			keys = [k, ...keys].slice(0, 12);
			report({ event: 'key', key: e.key, code: e.code, keyCode: e.keyCode });
			// Keep Back from leaving while we find out whether it reaches the page.
			if (e.key === 'BrowserBack' || e.key === 'GoBack') e.preventDefault();
		};
		document.addEventListener('keydown', onKey);

		// The Cast receiver SDK only exists when the page runs on a Cast device.
		const startCast = () => {
			const c = (
				window as unknown as {
					cast?: {
						framework?: { CastReceiverContext: { getInstance(): { start(o?: object): void } } };
					};
				}
			).cast;
			if (!c?.framework) {
				cast = 'no Cast SDK (not on a Cast device?)';
				return;
			}
			try {
				c.framework.CastReceiverContext.getInstance().start({ disableIdleTimeout: true });
				cast = 'started';
				report({ event: 'cast started' });
			} catch (err) {
				cast = `failed: ${err}`;
				report({ event: 'cast failed', error: String(err) });
			}
		};
		const sdk = document.createElement('script');
		sdk.src = 'https://www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
		sdk.onload = startCast;
		sdk.onerror = () => (cast = 'Cast SDK failed to load');
		document.head.append(sdk);

		return () => {
			clearInterval(tick);
			clearInterval(alive);
			document.removeEventListener('keydown', onKey);
		};
	});
</script>

<svelte:head>
	<title>Chota TV</title>
</svelte:head>

<!-- Remote keys arrive only with a media element on the page. -->
<cast-media-player style="display:none"></cast-media-player>

<main class="tv">
	<h1>chota</h1>
	<p class="up">Up {uptime(now - started)} · Cast {cast}</p>
	<p class="screen">{screen}</p>
	<h2>Press any key on the remote</h2>
	<ol>
		{#each keys as k (k.at + k.code + k.key)}
			<li><b>{k.key}</b> <span>{k.code || '—'} · {k.at}</span></li>
		{:else}
			<li class="none">Nothing yet</li>
		{/each}
	</ol>
</main>

<style>
	:global(html),
	:global(body) {
		background: #0b0b0c;
		color: #f2f2f2;
	}
	.tv {
		/* Keep clear of the edges: TVs may crop them. */
		padding: 5vh 5vw;
		font-family: system-ui, sans-serif;
	}
	h1 {
		font-size: 6vh;
		margin: 0 0 1vh;
	}
	h2 {
		font-size: 4vh;
		margin: 4vh 0 2vh;
	}
	.up {
		font-size: 3vh;
	}
	.screen {
		font-size: 1.8vh;
		opacity: 0.6;
	}
	ol {
		list-style: none;
		padding: 0;
		font-size: 3.5vh;
	}
	li span {
		opacity: 0.6;
		margin-left: 1vw;
	}
	.none {
		opacity: 0.5;
	}
</style>
