<script lang="ts">
	import Icon from "./Icon.svelte";

	export let message: string;
	export let icon = `fa-circle-info`;
	export let tone = `var(--color-accent-tertiary)`;
</script>

<aside class="info-notice gap-1" role="note" style={`--notice-tone: ${tone}`}>
	<Icon name={icon} {tone} />
	<p>{message}</p>
</aside>

<style lang="scss">
	.info-notice {
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
	p {
		margin: 0;
		font-size: inherit;
		line-height: inherit;
	}
</style>
