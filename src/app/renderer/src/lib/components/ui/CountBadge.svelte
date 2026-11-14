<script lang="ts">
	export let count = 0
	export let label: string | null = null
	export let floating = false
	export let variant: `alert` | `muted` | `pending` = `alert`
</script>

{#if count > 0 || label !== null}
	<span class="count-badge" class:count-badge--floating={floating} class:count-badge--muted={variant !== `alert`} class:count-badge--pending={variant === `pending`}>{label ?? count}</span>
{/if}

<style lang="scss">
	.count-badge {
		min-width: var(--count-badge-size, 18px);
		height: var(--count-badge-size, 18px);
		display: inline-grid;
		place-items: center;
		border: 2px solid var(--color-dark-primary);
		border-radius: 999px;
		padding: 0 4px;
		color: var(--white);
		background: rgb(220 38 38);
		font-size: var(--count-badge-font-size, 9px);
		font-weight: var(--font-weight-bold);
		line-height: 1;
	}
	.count-badge--floating {
		position: absolute;
		top: -5px;
		right: -5px;
	}
	.count-badge--muted {
		border: 1px solid var(--color-dark-secondary);
		border-radius: 6px;
		color: var(--color-light-tertiary);
		background: color-mix(in srgb, var(--color-dark-secondary) 10%, transparent);
		font-weight: 400;
	}
	.count-badge--pending {
		color: var(--color-danger);
		background: rgbaa(var(--color-danger), 0.05);
	}
</style>
