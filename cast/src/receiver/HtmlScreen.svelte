<!--
  A sender's HTML screen: sanitised markup in an open Shadow DOM, its CSS as a constructed stylesheet (which can't
  @import), and `contain: strict` so nothing positioned inside can cover the tabs.
-->
<script lang="ts">
	import { sanitize } from '../protocol/sanitize.ts';

	let { html, css = '' }: { html: string; css?: string } = $props();
	let host: HTMLDivElement;

	$effect(() => {
		const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
		const sheet = new CSSStyleSheet();
		// :host fills the area; rem stays the receiver's, so sender sizes scale with the TV like the blocks do.
		sheet.replaceSync(
			`:host{display:block;height:100%;overflow:hidden;color:#cfd2d6;font-family:system-ui,sans-serif}\n${css}`
		);
		root.adoptedStyleSheets = [sheet];
		root.innerHTML = sanitize(html);
	});
</script>

<div bind:this={host} class="h-full w-full" style="contain: strict"></div>
