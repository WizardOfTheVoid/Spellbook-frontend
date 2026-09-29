<script lang="ts">
	import AnimatedNumber from '$lib/components/ui/animatedNumber.svelte'
	import { dataChange } from '$lib/utils/dataChange'
	export let label: string
	export let value: string | number | null
	export let animate = false
	export let formatValue = (number: number | null) => number === null ? `—` : number.toLocaleString(`en-US`)
	export let caption: string
	export let icon = ``
	export let iconType: `solid` | `light` = `solid`
	export let iconColor: string | null = null
	export let variant: `default` | `impact` = `default`
	export let tone: `default` | `danger` | `blue` = `default`
</script>

<article class="dashboard-stat" class:dashboard-stat--impact={variant === `impact`} class:dashboard-stat--danger={tone === `danger`} class:dashboard-stat--blue={tone === `blue`}>
	<span>{label}{#if icon}<i class={`fa-${iconType} ${icon}`} style:color={iconColor ?? undefined} use:dataChange={animate ? value : undefined} aria-hidden="true"></i>{/if}</span>
	<strong>{#if animate && typeof value !== `string`}<AnimatedNumber {value} {formatValue} />{:else}{value}{/if}</strong>
	<small><slot name="caption">{caption}</slot></small>
</article>

<style lang="scss">
	.dashboard-stat { min-width: 0; display: grid; gap: 4px; padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), 0.34); }
	span { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-sm); color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	i { color: var(--color-accent-primary); font-size: var(--icon-size-xlg); }
	strong { font-size: var(--font-size-xl); }
	small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
	.dashboard-stat--impact { padding: var(--gutter-md) 14px; gap: var(--gutter-sm); }
	.dashboard-stat--impact strong { font-size: 24px; font-variant-numeric: tabular-nums; }
	.dashboard-stat--impact span, .dashboard-stat--impact small { font-size: var(--font-size-caption); }
	.dashboard-stat--danger i { color: var(--color-danger); }
	.dashboard-stat--blue i { color: var(--color-chart-2); }
</style>
