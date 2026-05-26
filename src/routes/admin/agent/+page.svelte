<script lang="ts">
	import { resolve } from '$app/paths';
	import { Chat } from '@ai-sdk/svelte';
	import { DefaultChatTransport } from 'ai';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// `Chat` defaults to POSTing to `/api/chat`; route it at our agent
	// endpoint via the transport (the `api: …` shortcut was deprecated in
	// v6 — see common-errors.md). Using the default `UIMessage` type
	// rather than the inferred `ChotaAgentUIMessage` so we don't import a
	// `$lib/server` value type into client code — tool parts still render
	// generically via the `tool-*` prefix check below.
	const chat = new Chat({
		transport: new DefaultChatTransport({ api: '/api/agent/chat' })
	});

	let input = $state('');

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		const trimmed = input.trim();
		if (!trimmed || chat.status === 'streaming' || chat.status === 'submitted') return;
		chat.sendMessage({ text: trimmed });
		input = '';
	}

	function fmtJSON(v: unknown): string {
		return JSON.stringify(v, null, 2);
	}
</script>

<svelte:head><title>Chota — Agent</title></svelte:head>

<div class="mx-auto min-h-screen max-w-6xl space-y-6 bg-slate-100 p-6 dark:bg-neutral-950">
	<header class="flex items-baseline justify-between">
		<div>
			<h1 class="text-2xl font-light tracking-tight text-slate-900 dark:text-neutral-100">Agent</h1>
			<p class="text-sm text-slate-500 dark:text-neutral-500">
				model: <span class="font-mono">{data.model}</span> · streaming chat · status:
				<span class="font-mono">{chat.status}</span>
			</p>
		</div>
		<a
			href={resolve('/admin')}
			class="text-sm text-slate-500 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
			>← admin</a
		>
	</header>

	<div class="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_18rem]">
		<!-- main column: chat -->
		<div class="space-y-4">
			<section
				class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
			>
				<form onsubmit={handleSubmit}>
					<label
						for="prompt"
						class="mb-2 block text-xs font-medium text-slate-500 dark:text-neutral-500"
					>
						prompt
					</label>
					<textarea
						id="prompt"
						bind:value={input}
						rows="3"
						placeholder="What's on the calendar tomorrow? How does photosynthesis work?"
						class="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:ring-1 focus:ring-slate-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:placeholder-neutral-600"
					></textarea>
					<div class="mt-3 flex items-center justify-between">
						<p class="text-xs text-slate-400 dark:text-neutral-600">
							{chat.messages.length} message{chat.messages.length === 1 ? '' : 's'}
						</p>
						<div class="flex gap-2">
							{#if chat.status === 'streaming' || chat.status === 'submitted'}
								<button
									type="button"
									onclick={() => chat.stop()}
									class="rounded-md bg-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-600"
								>
									Stop
								</button>
							{:else}
								<button
									type="button"
									onclick={() => (chat.messages = [])}
									disabled={chat.messages.length === 0}
									class="rounded-md px-3 py-1.5 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:text-neutral-500 dark:hover:text-neutral-300"
								>
									Clear
								</button>
							{/if}
							<button
								type="submit"
								disabled={!input.trim() ||
									chat.status === 'streaming' ||
									chat.status === 'submitted'}
								class="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white"
							>
								{chat.status === 'streaming' || chat.status === 'submitted' ? 'thinking…' : 'Run'}
							</button>
						</div>
					</div>
				</form>
				{#if chat.error}
					<p class="mt-3 text-sm text-red-600 dark:text-red-400">✗ {chat.error.message}</p>
				{/if}
			</section>

			<!-- conversation -->
			{#each chat.messages as message (message.id)}
				<section
					class="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
					class:bg-slate-50={message.role === 'user'}
					class:dark:bg-neutral-900={message.role === 'user'}
				>
					<div
						class="mb-2 text-[10px] font-medium tracking-wider text-slate-400 uppercase dark:text-neutral-500"
					>
						{message.role}
					</div>
					{#each message.parts as part, i (i)}
						{#if part.type === 'text'}
							<p class="text-sm whitespace-pre-wrap text-slate-800 dark:text-neutral-200">
								{part.text}
							</p>
						{:else if part.type.startsWith('tool-')}
							{@const tp = part as {
								type: string;
								state: string;
								input?: unknown;
								output?: unknown;
								errorText?: string;
							}}
							<details class="mt-2 text-xs">
								<summary
									class="cursor-pointer text-slate-500 select-none hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-300"
								>
									<span class="font-mono">{tp.type.replace(/^tool-/, '')}</span>
									<span class="ml-2 text-slate-400 dark:text-neutral-600">· {tp.state}</span>
								</summary>
								<div class="mt-2 space-y-2">
									{#if tp.input}
										<div>
											<div class="text-slate-600 dark:text-neutral-400">input:</div>
											<pre
												class="ml-3 font-mono text-[11px] whitespace-pre-wrap text-slate-500 dark:text-neutral-500">{fmtJSON(
													tp.input
												)}</pre>
										</div>
									{/if}
									{#if tp.output}
										<div>
											<div class="text-slate-600 dark:text-neutral-400">output:</div>
											<pre
												class="ml-3 max-h-48 overflow-auto rounded bg-slate-50 p-2 font-mono text-[11px] whitespace-pre-wrap text-slate-700 dark:bg-neutral-950 dark:text-neutral-300">{fmtJSON(
													tp.output
												)}</pre>
										</div>
									{/if}
									{#if tp.errorText}
										<p class="text-red-600 dark:text-red-400">error: {tp.errorText}</p>
									{/if}
								</div>
							</details>
						{:else if part.type === 'reasoning'}
							{@const rp = part as { type: 'reasoning'; text?: string }}
							{#if rp.text}
								<details class="mt-2 text-xs">
									<summary
										class="cursor-pointer text-slate-400 italic select-none hover:text-slate-600 dark:text-neutral-600"
										>reasoning</summary
									>
									<p class="mt-1 whitespace-pre-wrap text-slate-500 dark:text-neutral-500">
										{rp.text}
									</p>
								</details>
							{/if}
						{/if}
					{/each}
				</section>
			{:else}
				<p class="text-sm text-slate-400 italic dark:text-neutral-600">
					no messages yet — type a prompt above
				</p>
			{/each}
		</div>

		<!-- sidebar: tools + env health -->
		<aside class="space-y-4">
			<section
				class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
			>
				<h2 class="mb-2 text-xs font-medium tracking-wider text-slate-500 uppercase">
					tools ({data.tools.length})
				</h2>
				<ul class="space-y-3 text-xs">
					{#each data.tools as t (t.name)}
						<li>
							<div class="font-mono text-slate-800 dark:text-neutral-200">
								{t.name}({t.fields.join(', ')})
							</div>
							<p class="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-neutral-500">
								{t.description}
							</p>
						</li>
					{/each}
				</ul>
			</section>

			<section
				class="rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:ring-neutral-800"
			>
				<h2 class="mb-2 text-xs font-medium tracking-wider text-slate-500 uppercase">env</h2>
				<ul class="space-y-1 text-xs">
					{#each Object.entries(data.health) as [name, ok] (name)}
						<li class="flex items-center justify-between">
							<span class="text-slate-600 dark:text-neutral-400">{name}</span>
							<span class={ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
								{ok ? '✓' : '✗'}
							</span>
						</li>
					{/each}
				</ul>
				<p class="mt-3 text-[10px] leading-snug text-slate-400 dark:text-neutral-600">
					calendar needs Google sign-in on /admin + calendar.id in chota.config.ts. ticktick needs
					TICKTICK_API_KEY + lists configured.
				</p>
			</section>
		</aside>
	</div>
</div>
