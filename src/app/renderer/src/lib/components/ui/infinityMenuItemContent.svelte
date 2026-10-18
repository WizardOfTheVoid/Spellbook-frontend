<script lang="ts">
	import type { InfinityMenuItem } from "./infinityMenu"
	import Icon from "./Icon.svelte"
	import CountBadge from "./CountBadge.svelte"

	export let item: InfinityMenuItem
	export let trailing: `child` | `toggle` | null = null
	export let checked = false
</script>

<span class="menu-item-content">
	<Icon name={item.icon} type={item.iconType ?? `light`} tone={item.iconColor ?? `inherit`} size="md" />
	<span class="menu-item-content__labels">
		<span class="menu-item-content__name">
			{item.name} <CountBadge count={item.badge ?? 0} />{#if item.suffix} <small>{item.suffix}</small>{/if}{#if item.suffixIcon} <span class="menu-item-content__suffix-icon" aria-label="Personal profile"><Icon name={item.suffixIcon} size="sm" tone="muted" /></span>{/if}
		</span>
		{#if item.subtitle}<small class="menu-item-content__subtitle">{item.subtitle}</small>{/if}
	</span>
	{#if trailing === `child`}
		<Icon name="fa-chevron-right" size="sm" tone="muted" />
	{:else if trailing === `toggle`}
		<span class:menu-item-content__check--hidden={!checked}>
			<Icon name="fa-check" size="sm" tone="var(--color-accent-primary)" />
		</span>
	{/if}
</span>

<style lang="scss">
	.menu-item-content {
		width: 100%;
		display: grid;
		grid-template-columns: 22px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gutter-sm);
	}

	.menu-item-content__labels {
		min-width: 0;
		display: grid;
		gap: 2px;
	}

	.menu-item-content__name,
	.menu-item-content__subtitle {
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.menu-item-content__name { white-space: nowrap; }
	.menu-item-content__name small,
	.menu-item-content__subtitle { color: var(--color-light-tertiary); }
	.menu-item-content__subtitle { font-size: var(--font-size-xs); font-weight: var(--font-weight); }
	.menu-item-content__suffix-icon { margin-left: 0.35em; opacity: 0.5; }
	.menu-item-content__check--hidden { visibility: hidden; }
</style>
