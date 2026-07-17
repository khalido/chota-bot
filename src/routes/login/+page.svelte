<script lang="ts">
	import { authClient } from '$lib/auth-client';

	let { data } = $props();

	async function signInGoogle() {
		await authClient.signIn.social({ provider: 'google', callbackURL: '/admin' });
	}

	async function signOut() {
		await authClient.signOut();
		location.reload();
	}
</script>

<svelte:head>
	<title>Sign in — Chota</title>
</svelte:head>

<div class="flex min-h-[60vh] items-center justify-center px-4">
	<div
		class="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 text-center dark:border-neutral-800 dark:bg-neutral-950"
	>
		<h1 class="text-lg font-semibold text-slate-900 dark:text-neutral-100">Admin sign-in</h1>

		{#if data.email}
			<p class="mt-3 text-sm text-slate-600 dark:text-neutral-400">
				Signed in as <span class="font-medium">{data.email}</span>, but this account isn't on the
				admin list. Add it to <code class="text-xs">adminEmails</code> in
				<code class="text-xs">chota.config.ts</code> and redeploy.
			</p>
			<button
				onclick={signOut}
				class="mt-4 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
			>
				Sign out
			</button>
		{:else}
			<p class="mt-3 text-sm text-slate-600 dark:text-neutral-400">
				The admin pages and agent API are for the family's grown-ups.
			</p>
			<button
				onclick={signInGoogle}
				class="mt-4 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
			>
				Sign in with Google
			</button>
		{/if}
	</div>
</div>
