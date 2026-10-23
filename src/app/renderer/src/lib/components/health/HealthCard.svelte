<script lang="ts">
	import type { Tone } from "$lib/types/tone";
	import Tile from "$lib/components/ui/Tile.svelte";

	export let label: string;
	export let status: string;
	export let detail: string;
	export let latency: string;
	export let running: boolean | null;

	$: tone = (
		running === true ? "success"
		: running === false ? "danger"
		: "muted") as Tone;
	$: icon =
		running === true ? "fa-circle-check"
		: running === false ? "fa-circle-xmark"
		: "fa-circle-minus";
</script>

<Tile
	title={label}
	subtitle={`${detail} ${latency}`.trim()}
	value={status}
	{icon}
	iconTone={tone}
	{tone}
/>
