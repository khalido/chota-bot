<!--
  A code sample with syntax colours. highlight.js escapes the source before adding its spans, and every sample on the
  page is our own text, so {@html} here only ever holds highlight.js output.
-->
<script lang="ts">
	import hljs from 'highlight.js/lib/core';
	import json from 'highlight.js/lib/languages/json';
	import python from 'highlight.js/lib/languages/python';
	import typescript from 'highlight.js/lib/languages/typescript';

	hljs.registerLanguage('json', json);
	hljs.registerLanguage('typescript', typescript);
	hljs.registerLanguage('python', python);

	let { code, lang = 'json' }: { code: string; lang?: 'json' | 'typescript' | 'python' } = $props();
	const html = $derived(hljs.highlight(code, { language: lang }).value);
</script>

<pre class="mt-4"><code class="hljs">{@html html}</code></pre>
