<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte";
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import type { MessageTagItem } from "$lib/utils/messageTags";

	export let tags: MessageTagItem[] = [];
	export let onSelect: (tag: string) => void;
	$: groups = [
		...new Set(tags.map((item) => item.group ?? `Available variables`)),
	];
</script>

<div class="variable-tag-picker" aria-label="Message variables">
	<header>
		<strong>Variables</strong><small>Click to insert & hover for example.</small
		>
	</header>
	<section>
		<div class="variable-tag-picker__items">
			{#each groups as group}
				{#each tags.filter((item) => (item.group ?? `Available variables`) === group) as item (item.tag)}
					{#if item.disabled}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<span
							class="variable-tag-picker__disabled"
							tabindex="0"
							use:tooltipAction={`ie. ${item.example || `Example value`}`}
						>
							<Button size="sm" label={item.tag.slice(1, -1)} disabled />
						</span>
					{:else}
						<Button
							size="sm"
							label={item.tag.slice(1, -1)}
							tooltip={`ie. ${item.example || `Example value`}`}
							sfx="select"
							onClick={() => onSelect(item.tag)}
						/>
					{/if}
				{/each}
			{/each}
		</div>
	</section>

	<small class="variable-tag-picker__help"
		><strong>Fallback example</strong>: <code>[server_name|Our Server]</code>.
	</small>
</div>

<style lang="scss">
	.variable-tag-picker,
	section {
		display: grid;
		gap: var(--gutter-sm);
	}
	header {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--gutter-sm);
	}
	header strong {
		font-size: var(--font-size-sm);
	}
	small,
	h3 {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}
	h3 {
		margin: 0;
		font-weight: var(--font-weight-medium);
	}
	.variable-tag-picker__items {
		display: flex;
		flex-wrap: wrap;
		gap: 5px;
	}
	.variable-tag-picker__disabled:focus-visible {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}
	.variable-tag-picker__help {
		line-height: 1.6;
	}
</style>
