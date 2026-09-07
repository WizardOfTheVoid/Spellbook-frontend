<script lang="ts">
	export let label: string
	export let value: string | number
	export let caption: string
	export let icon = ``
</script>

<article class="dashboard-stat">
	<span>{label}{#if icon}<i class={`fa-solid ${icon}`} aria-hidden="true"></i>{/if}</span>
	<strong>{value}</strong>
	<small>{caption}</small>
</article>

<style lang="scss">
	.dashboard-stat { min-width: 0; display: grid; gap: 4px; padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), 0.34); }
	span { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-sm); color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	i { color: var(--color-accent-primary); }
	strong { font-size: var(--font-size-xl); }
	small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
</style>
