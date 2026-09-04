<script lang="ts">
	import { tooltip as tooltipAction } from "$lib/utils/tooltip"
	import type { MessageTagItem } from "$lib/utils/messageTags"

	export let tags: MessageTagItem[] = []
	export let onSelect: (tag: string) => void
</script>

<div class="variable-tag-picker" aria-label="Message variable tags">
	<div class="variable-tag-picker__items">
		{#each tags as item (item.tag)}
			{#if item.disabled}
				<!-- The wrapper remains focusable so keyboard users receive the disabled-tag reason. -->
				<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
				<span class="variable-tag-picker__disabled" tabindex="0" use:tooltipAction={item.tooltip}>
					<button class="variable-tag-picker__tag" type="button" disabled>{item.tag}</button>
				</span>
			{:else}
				<button
					class="variable-tag-picker__tag"
					type="button"
					use:tooltipAction={item.tooltip}
					data-uisfx="select"
					on:click={() => onSelect(item.tag)}>{item.tag}</button
				>
			{/if}
		{/each}
	</div>
	<small class="variable-tag-picker__help">Optional fallback: [variable|Fallback text]</small>
</div>

<style lang="scss">
	.variable-tag-picker {
		display: grid;
		gap: var(--gutter-sm);
	}

	.variable-tag-picker__items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--gutter-sm);
	}

	.variable-tag-picker__disabled {
		display: inline-flex;
	}

	.variable-tag-picker__tag {
		min-height: var(--control-height-sm);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		color: var(--color-text-secondary);
		background: transparent;
		font: inherit;
		font-size: var(--font-size-md);
		font-weight: var(--font-weight);
		white-space: nowrap;
		cursor: pointer;
		user-select: none;
		transition: all var(--motion-fast) var(--motion-ease);

		&:disabled {
			opacity: 0.45;
			cursor: not-allowed;
		}

		&:hover {
			border-color: var(--color-accent-primary);
			color: var(--color-light-primary);
			transition: all 0ms;
		}

		&:active {
			background-color: rgbaa(var(--color-accent-primary), 0.1);
		}

		&:focus-visible {
			outline: 2px solid var(--color-accent-primary);
			outline-offset: 2px;
		}
	}

	.variable-tag-picker__help {
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
	}
</style>
