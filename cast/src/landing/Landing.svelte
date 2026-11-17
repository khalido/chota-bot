<script lang="ts">
	import { Block, LIMITS, NAMESPACE, ERROR_CODES, type BlockType } from '../protocol/schema.ts';
	import { APP_ID, SOURCE, sourceFile } from '../config.ts';
	import senderTs from '../../examples/sender.ts?raw';
	import senderPy from '../../examples/sender.py?raw';

	const json = (v: unknown) => JSON.stringify(v, null, 2);

	/** Field names come from the schema itself, so this table can't drift from what the receiver accepts. */
	const BLOCKS: Record<BlockType, string> = {
		clock: 'The time and date, ticking on the TV.',
		stat: 'One big number with a label, unit and a coloured change.',
		list: 'Rows of text with a right-hand value; done items struck through.',
		cards: 'A row of cards: title, body, time, optional image.',
		text: 'Markdown-ish text: headings, paragraphs, bullets, bold, italic, code. No HTML.',
		image: 'One https: or data:image picture with a caption.',
		weather: 'Now, a note, and the next hours (past hours drop off).',
		'calendar-day': "A day's events; the one on now is marked, past ones dim.",
		bus: 'Departures by route, counting down in minutes on the TV.'
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
		{ v: 1, id: 'a5', type: 'clear', revision: 1763164900000 }
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
		A Google Cast receiver that shows screens your program sends it: clocks, numbers, lists,
		weather, the day's calendar, buses, or your own HTML. Your server stays on your network; nothing
		here fetches your data.
	</p>
	<p class="mt-3">
		<a class="underline" href="/receiver?demo">See the demo screens</a> ·
		<a class="underline" href="/llms.txt">llms.txt</a>
		· <a class="underline" href={SOURCE}>Source</a>
	</p>

	<h2 class="mt-12 text-2xl font-semibold">How it works</h2>
	<ol class="mt-3 list-decimal space-y-1 pl-6">
		<li>
			Your program, on the same Wi-Fi as the TV, launches the app <code>{APP_ID}</code> on the TV, as
			any Cast sender does.
		</li>
		<li>
			It sends JSON on the namespace <code>{NAMESPACE}</code>: the screens, which one to show, a
			theme.
		</li>
		<li>
			The TV shows them. Send again whenever something changes. Back on the remote closes the app.
		</li>
	</ol>
	<p class="mt-3">
		The receiver holds nothing between launches and makes no network calls except loading images and
		fonts you name. It never runs your JavaScript. Launch it without a sender and you get a clock
		and "Waiting for a sender".
	</p>

	<h2 class="mt-12 text-2xl font-semibold">Messages</h2>
	<p class="mt-3">
		Every message is an envelope: <code>v</code> (1), your <code>id</code>, a <code>type</code>, a
		<code>revision</code>, and the payload in <code>data</code>. The receiver refuses a revision
		older than the newest it has applied, so if two senders talk, the newest wins.
		<code>Date.now()</code> is a good revision.
	</p>
	<pre class="mt-4"><code>{json(screensExample)}</code></pre>
	<ul class="mt-4 list-disc space-y-1 pl-6">
		<li>
			<code>screens</code>: replace the list. <code>show</code> picks the screen; otherwise the current
			one stays if it's still there.
		</li>
		<li><code>screen</code>: update one screen in place by id, or add it.</li>
		<li><code>show</code>: switch to a screen.</li>
		<li>
			<code>theme</code>: accent colour, density (<code>comfortable</code> or <code>compact</code>),
			time zone, 12-hour clock.
		</li>
		<li><code>clear</code>: back to the waiting clock.</li>
	</ul>
	<pre class="mt-4"><code>{others.map((m) => JSON.stringify(m)).join('\n')}</code></pre>

	<h3 class="mt-8 text-lg font-semibold">Screens and blocks</h3>
	<p class="mt-2">
		A screen has an <code>id</code>, a <code>title</code> (its tab label) and either
		<code>blocks</code>
		laid out in
		<code>columns</code> (1 to 4, default 2; a block's <code>span</code> takes more), or
		<code>html</code>.
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
		drops what has passed, so a bus board stays right between your updates. Full field list:
		<a class="underline" href={sourceFile('src/protocol/schema.ts')}>schema.ts</a>.
	</p>

	<h3 class="mt-8 text-lg font-semibold">Your own HTML</h3>
	<p class="mt-2">
		<code>html: &lbrace; html, css &rbrace;</code> instead of blocks. The HTML is sanitised with
		DOMPurify (no scripts, event handlers, frames or forms) and shown in a Shadow DOM, so your CSS
		can't break the receiver. Images and URLs must be
		<code>https:</code> or <code>data:image/</code>. <code>1rem</code> is 1/54 of the screen's height,
		as for the blocks.
	</p>

	<h3 class="mt-8 text-lg font-semibold">Big payloads</h3>
	<p class="mt-2">
		Cast caps a message at 64 KB. Keep each one under {LIMITS.partBytes / 1000} KB: split the JSON of
		<code>data</code>
		into slices and send each with <code>seq</code>, <code>total</code> and the slice in
		<code>chunk</code>, the same
		<code>id</code> on every part. The receiver joins them and drops a payload still incomplete
		after {LIMITS.partialMs / 1000} s or when its sender disconnects.
	</p>
	<pre class="mt-4"><code>{JSON.stringify(part)}</code></pre>
	<p class="mt-3">Limits:</p>
	<pre class="mt-2"><code>{json(LIMITS)}</code></pre>

	<h3 class="mt-8 text-lg font-semibold">Replies</h3>
	<p class="mt-2">
		The receiver answers each complete payload with <code>ack</code>, or <code>error</code> with a
		code:
		{#each ERROR_CODES as code, i (code)}<code>{code}</code>{i < ERROR_CODES.length - 1
				? ', '
				: '.'}{/each}
		Both carry the receiver's current <code>revision</code>, so a sender refused as
		<code>stale</code> can catch up.
	</p>
	<pre class="mt-4"><code>{replies.map((m) => JSON.stringify(m)).join('\n')}</code></pre>

	<h2 class="mt-12 text-2xl font-semibold">Senders</h2>
	<h3 class="mt-6 text-lg font-semibold">
		TypeScript, with <a class="underline" href="https://www.npmjs.com/package/@khalido/home"
			>@khalido/home</a
		>
	</h3>
	<pre class="mt-3"><code>{senderTs}</code></pre>
	<p class="mt-2 text-sm opacity-80">
		<code>split()</code> is
		<a class="underline" href={sourceFile('src/protocol/split.ts')}>src/protocol/split.ts</a>; it
		needs only <code>LIMITS.partBytes</code> from the schema.
	</p>
	<h3 class="mt-6 text-lg font-semibold">Python, with pychromecast</h3>
	<pre class="mt-3"><code>{senderPy}</code></pre>

	<p class="mt-14 text-sm opacity-60">
		Built by Khalid Omar · <a class="underline" href={SOURCE}>{SOURCE.replace('https://', '')}</a>
	</p>
</main>
