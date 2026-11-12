<script lang="ts">
	import Icon from "./Icon.svelte";

	export let message: string;
	export let icon = `fa-circle-info`;
	export let tone = `var(--color-accent-tertiary)`;
	export let onClick: (() => void) | null = null;
</script>

{#if onClick}
	<button class="info-notice gap-1" type="button" style={`--notice-tone: ${tone}`} on:click={onClick}>
		<Icon name={icon} {tone} /><p>{message}</p>
	</button>
{:else}
	<aside class="info-notice gap-1" role="note" style={`--notice-tone: ${tone}`}>
		<Icon name={icon} {tone} /><p>{message}</p>
	</aside>
{/if}

<style lang="scss">
	.info-notice {
		width: 100%;
		box-sizing: border-box;
		text-align: left;
		display: flex;
		align-items: center;
		padding: var(--gutter-md);
		border: 1px solid rgbaa(var(--notice-tone), 0.25);
		border-radius: var(--radius);
		background: rgbaa(var(--notice-tone), 0.05);
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		line-height: 1.6;
	}
	button.info-notice { cursor: pointer; }
	button.info-notice:hover { border-color: var(--notice-tone); }
	p {
		margin: 0;
		font-size: inherit;
		line-height: inherit;
	}
</style>
