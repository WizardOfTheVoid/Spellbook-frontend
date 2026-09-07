<script lang="ts">
	import Icon from "./Icon.svelte"

	export let message: string
	export let icon = `fa-circle-info`
</script>

<aside class="info-notice gap-1" role="note">
	<Icon name={icon} tone="var(--color-accent-tertiary)" />
	<p>{message}</p>
</aside>

<style lang="scss">
	.info-notice {
		display: flex;
		align-items: center;
		padding: var(--gutter-md);
		border: 1px solid rgbaa(var(--color-accent-tertiary), 0.25);
		border-radius: var(--radius);
		background: rgbaa(var(--color-accent-tertiary), 0.05);
		color: var(--color-light-secondary);
	}
	p { margin: 0; font-size: var(--font-size-sm); line-height: 1.6; }
</style>
