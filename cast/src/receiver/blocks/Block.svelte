<script lang="ts">
	import type { Block } from '../../protocol/schema.ts';
	import Bus from './Bus.svelte';
	import CalendarDay from './CalendarDay.svelte';
	import Cards from './Cards.svelte';
	import Clock from './Clock.svelte';
	import Image from './Image.svelte';
	import Leave from './Leave.svelte';
	import Person from './Person.svelte';
	import List from './List.svelte';
	import Stat from './Stat.svelte';
	import Text from './Text.svelte';
	import Weather from './Weather.svelte';
	import Week from './Week.svelte';

	let { block }: { block: Block } = $props();
</script>

{#if block.type === 'clock'}<Clock {block} />
{:else if block.type === 'stat'}<Stat {block} />
{:else if block.type === 'list'}<List {block} />
{:else if block.type === 'cards'}<Cards {block} />
{:else if block.type === 'text'}<Text {block} />
{:else if block.type === 'image'}<Image {block} />
{:else if block.type === 'weather'}<Weather {block} />
{:else if block.type === 'calendar-day'}<CalendarDay {block} />
{:else if block.type === 'week'}<Week {block} />
{:else if block.type === 'bus'}<Bus {block} />
{:else if block.type === 'leave'}<Leave {block} />
{:else if block.type === 'person'}<Person {block} />
{/if}
