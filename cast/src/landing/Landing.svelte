<script lang="ts">
	import { Block, LIMITS, NAMESPACE, ERROR_CODES, type BlockType } from '../protocol/schema.ts';
	import { APP_ID, SOURCE, sourceFile } from '../config.ts';
	import senderTs from '../../examples/sender.ts?raw';
	import senderPy from '../../examples/sender.py?raw';
	import Code from './Code.svelte';
	import Preview from './Preview.svelte';

	const json = (v: unknown) => JSON.stringify(v, null, 2);

	/** Field names come from the schema itself, so this table can't drift from what the receiver accepts. */
	const BLOCKS: Record<BlockType, string> = {
		clock: 'Time and date, kept by the TV.',
		stat: 'One big number, with a label, unit and coloured change.',
		list: 'Rows with a value on the right. Done items are struck through.',
		cards: 'Cards with a title, body, time and optional image.',
		text: 'Headings, paragraphs, bullets, bold, italic, code. No HTML.',
		image: 'One picture, https: or data:image, with a caption.',
		weather: 'Now, a note and the next hours. Past hours drop off.',
		'calendar-day': "A day's events. The one on now is marked; past ones dim.",
		week: 'Up to seven days side by side. Today is marked.',
		bus: 'Departures by route, counting down in minutes.'
	};
	const fields = (type: BlockType) =>
		Object.keys(Block.options.find((o) => o.shape.type.value === type)?.shape ?? {}).filter(
			(k) => k !== 'type'
		);

	const screensExample = {
		v: 1,
		id: 'a1',
		type: 'screens',
		revision: 1763164800000,
		data: {
			screens: [
				{
					id: 'today',
					title: 'Today',
					columns: 2,
					blocks: [
						{ type: 'clock' },
						{
							type: 'stat',
							label: 'Solar now',
							value: 4.2,
							unit: 'kW',
							delta: '+0.6 kW',
							tone: 'good'
						},
						{
							type: 'bus',
							routes: [
								{
									route: '370',
									to: 'School',
									departures: [{ at: '2026-11-15T08:04:00+11:00', realtime: true }]
								}
							]
						}
					]
				},
				{ id: 'note', title: 'Note', html: { html: '<h1>Hello</h1>', css: 'h1{font-size:5rem}' } }
			]
		}
	};
	const others = [
		{ v: 1, id: 'a2', type: 'show', revision: 1763164800000, data: { screen: 'note' } },
		{
			v: 1,
			id: 'a3',
			type: 'theme',
			revision: 1763164800000,
			data: { accent: '#7aa2c8', density: 'compact', timezone: 'Australia/Sydney', hour12: true }
		},
		{
			v: 1,
			id: 'a4',
			type: 'screen',
			revision: 1763164860000,
			data: {
				screen: { id: 'note', title: 'Note', blocks: [{ type: 'text', text: '# Dinner at 7' }] }
			}
		},
		{
			v: 1,
			id: 'a5',
			type: 'banner',
			revision: 1763164870000,
			data: { text: 'Bus in 6 min, shoes on', tone: 'warn', seconds: 120 }
		},
		{ v: 1, id: 'a7', type: 'clear', revision: 1763164900000 }
	];
	const part = {
		v: 1,
		id: 'big1',
		type: 'screens',
		revision: 1763164800000,
		seq: 0,
		total: 3,
		chunk: '{"screens":[{"id":"photos","title":"Pho'
	};
	const keyExample = {
		v: 1,
		type: 'key',
		key: 'Enter',
		code: 'Enter',
		keyCode: 13,
		screen: 'today',
		item: 'chore-3'
	};
	const replies = [
		{ v: 1, type: 'ack', id: 'a1', revision: 1763164800000 },
		{
			v: 1,
			type: 'error',
			id: 'a6',
			code: 'stale',
			message: 'revision 1763164000000 is older than 1763164800000',
			revision: 1763164800000
		}
	];
</script>

<main class="mx-auto max-w-3xl px-5 py-14 leading-relaxed">
	<h1 class="text-4xl font-semibold tracking-tight">
		Put a dashboard on any Google TV from your own server.
	</h1>
	<p class="mt-4 text-lg opacity-80">
		Your program sends screens; the TV shows them. Clocks, numbers, lists, weather, the day's
		calendar, buses, or your own HTML. Your data stays on your network.
	</p>

	<Preview />

	<p class="mt-6">
		<a class="underline" href="/llms.txt">llms.txt</a> ·
		<a class="underline" href={SOURCE}>Source</a>
	</p>

	<h2 class="mt-12 text-2xl font-semibold">How it works</h2>
	<ol class="mt-3 list-decimal space-y-1 pl-6">
		<li>Your program, on the same Wi-Fi as the TV, launches Cast app <code>{APP_ID}</code>.</li>
		<li>
			It sends JSON on <code>{NAMESPACE}</code>: the screens, which one to show, a theme.
		</li>
		<li>
			The TV shows them. Send again when something changes. Back on the remote, Home or another app
			closes it.
		</li>
	</ol>
	<p class="mt-3">
		The receiver keeps nothing between launches and fetches nothing but the images and fonts you
		name. It never runs your JavaScript. Launched with no sender, it shows a clock and "Waiting for
		a sender".
	</p>

	<h2 class="mt-12 text-2xl font-semibold">Messages</h2>
	<p class="mt-3">
		Every message has <code>v</code> (1), your <code>id</code>, a <code>type</code>, a
		<code>revision</code> and the payload in <code>data</code>. The receiver refuses a revision
		older than the newest it has applied, so if two senders talk, the newest wins. Use
		<code>Date.now()</code>.
	</p>
	<Code code={json(screensExample)} />
	<ul class="mt-4 list-disc space-y-1 pl-6">
		<li>
			<code>screens</code>: replace the list. <code>show</code> picks the screen; without it the current
			one stays if it's still there.
		</li>
		<li><code>screen</code>: replace one screen by id, or add it.</li>
		<li><code>show</code>: switch to a screen.</li>
		<li>
			<code>theme</code>: accent colour, density (<code>comfortable</code> or <code>compact</code>),
			time zone, 12-hour clock, and <code>rotate</code> to show each screen in turn.
		</li>
		<li><code>clear</code>: back to the waiting clock.</li>
		<li>
			<code>banner</code>: a line over any screen for <code>seconds</code> (default 30), e.g. "Bus in
			6 min, shoes on".
		</li>
		<li><code>ping</code>: the receiver answers <code>pong</code> with what it's showing.</li>
	</ul>
	<Code code={others.map((m) => JSON.stringify(m)).join('\n')} />

	<h3 class="mt-8 text-lg font-semibold">Screens and blocks</h3>
	<p class="mt-2">
		A screen has an <code>id</code>, a <code>title</code> (its tab label), and either
		<code>blocks</code> in <code>columns</code> (1 to 4, default 2; a block's <code>span</code>
		takes more) or <code>html</code>.
	</p>
	<table class="mt-4 w-full text-sm">
		<tbody>
			{#each Object.entries(BLOCKS) as [type, what] (type)}
				<tr class="border-t border-current/10 align-top">
					<td class="py-2 pr-4"><code>{type}</code></td>
					<td class="py-2 pr-4">{what}</td>
					<td class="py-2 opacity-70"><code>{fields(type as BlockType).join(', ')}</code></td>
				</tr>
			{/each}
		</tbody>
	</table>
	<p class="mt-3 text-sm opacity-80">
		Times are ISO 8601 instants (<code>2026-11-15T08:04:00+11:00</code>). The TV counts down and
		drops what has passed, so a bus board stays right between updates. Every field:
		<a class="underline" href={sourceFile('src/protocol/schema.ts')}>schema.ts</a>.
	</p>

	<h3 class="mt-8 text-lg font-semibold">Your own HTML</h3>
	<p class="mt-2">
		Send <code>html: &lbrace; html, css &rbrace;</code> instead of blocks. DOMPurify strips scripts,
		event handlers, frames and forms, and the result goes in a Shadow DOM, so your CSS can't break
		the receiver. URLs must be <code>https:</code> or <code>data:image/</code>. <code>1rem</code> is 1/54
		of the screen height, as for the blocks.
	</p>

	<h3 class="mt-8 text-lg font-semibold">Big payloads</h3>
	<p class="mt-2">
		Cast caps a message at 64 KB, so keep each under {LIMITS.partBytes / 1000} KB. To send more, slice
		the JSON of <code>data</code> and send each slice in <code>chunk</code> with <code>seq</code>
		and
		<code>total</code>, the same <code>id</code> on every part. The receiver joins them, and drops a
		payload still incomplete after {LIMITS.partialMs / 1000} s or when its sender disconnects.
	</p>
	<Code code={JSON.stringify(part)} />
	<p class="mt-3">Limits:</p>
	<Code code={json(LIMITS)} />

	<h3 class="mt-8 text-lg font-semibold">Replies</h3>
	<p class="mt-2">
		The receiver answers each payload with <code>ack</code>, or <code>error</code> and a code:
		{#each ERROR_CODES as code, i (code)}<code>{code}</code>{i < ERROR_CODES.length - 1
				? ', '
				: '.'}{/each}
		A <code>ping</code> gets a <code>pong</code> with the screen on show and the TV's user agent.
		All replies carry the receiver's current <code>revision</code>, so a sender refused as
		<code>stale</code> can catch up.
	</p>
	<Code code={replies.map((m) => JSON.stringify(m)).join('\n')} />

	<h3 class="mt-8 text-lg font-semibold">The remote</h3>
	<p class="mt-2">
		Back closes the app, and so does leaving it (Home, another app). Left and right switch screens.
		Up and down move a focus ring over the rows of the screen. Every other key goes to your program,
		with the screen and the focused row (its
		<code>id</code>, or block and row numbers from 0):
	</p>
	<Code code={JSON.stringify(keyExample)} />

	<h2 class="mt-12 text-2xl font-semibold">Senders</h2>
	<h3 class="mt-6 text-lg font-semibold">
		TypeScript, with <a class="underline" href="https://www.npmjs.com/package/@khalido/home"
			>@khalido/home</a
		>
	</h3>
	<Code code={senderTs} lang="typescript" />
	<p class="mt-2 text-sm opacity-80">
		<code>split()</code> is in
		<a class="underline" href={sourceFile('src/protocol/split.ts')}>src/protocol/split.ts</a>. Copy
		it; it needs only <code>LIMITS.partBytes</code> from the schema.
	</p>
	<h3 class="mt-6 text-lg font-semibold">Python, with pychromecast</h3>
	<Code code={senderPy} lang="python" />

	<p class="mt-14 text-sm opacity-60">
		Built by Khalid Omar · <a class="underline" href={SOURCE}>{SOURCE.replace('https://', '')}</a>
	</p>
</main>
