<script lang="ts">
	import Icon from "./Icon.svelte"

	export let title: string
	export let group: string | undefined = undefined
</script>

<details name={group}>
	<summary>
		<span>{title}</span>
		<span class="chevron" aria-hidden="true"><Icon name="fa-chevron-down" size="xs" /></span>
	</summary>
	<div class="content"><slot /></div>
</details>

<style lang="scss">
	details {
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		background: rgbaa(var(--color-dark-secondary), 0.08);
	}

	summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gutter-md);
		padding: var(--gutter-md);
		cursor: pointer;
		font-weight: var(--font-weight-medium);
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:focus-visible {
		outline: 2px solid var(--color-accent-secondary);
		outline-offset: 2px;
	}

	.chevron {
		transition: transform 150ms ease;
	}

	details[open] .chevron {
		transform: rotate(180deg);
	}

	.content {
		padding: 0 var(--gutter-md) var(--gutter-md);
		color: var(--color-light-secondary);
	}
</style>
