<script lang="ts">
	import type { MenuItem } from "$lib/types/ui";
	import type { Tone } from "$lib/types/tone";
	import IconBadge from "./IconBadge.svelte";
	import RowMenu from "./RowMenu.svelte";

	export let stats: {
		icon: string;
		value: string;
		tone?: Tone;
		label?: string;
	}[];
	export let menuItems: MenuItem[] = [];
</script>

<div class="stat-bar">
	{#each stats as stat (stat.icon)}
		<span class="stat-bar__cell" aria-label={stat.label ?? undefined}>
			<IconBadge
				name={stat.icon}
				tone={stat.tone ?? "success"}
				variant="ring"
				shape="round"
			/>
			<b>{stat.value}</b>
		</span>
	{/each}
	{#if menuItems.length > 0}
		<RowMenu items={menuItems} ariaLabel="Stat bar actions" />
	{/if}
</div>

<style lang="scss">
	.stat-bar {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-lg);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-md) var(--gutter-md);
		background: var(--color-dark-primary);
		box-shadow: var(--shadow);
	}

	.stat-bar__cell {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-md);
	}

	b {
		color: var(--color-light-primary);
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		white-space: nowrap;
	}
</style>
