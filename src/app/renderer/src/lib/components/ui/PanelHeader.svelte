<script lang="ts">
	import { tooltip as tooltipAction } from "$lib/utils/tooltip";
	import Icon from "./Icon.svelte";
	import IconButton from "./IconButton.svelte";

	export let title: string;
	export let eyebrow: string | null = null;
	export let help: string | null = null;
	export let variant: "panel" | "section" = "panel";
	export let leadingIcon: string | null = null;
	export let leadingLabel = "Back";
	export let leadingDisabled = false;
	export let onLeading: (() => void) | null = null;
</script>

<header class="panel-header panel-header--{variant}">
	{#if leadingIcon && onLeading}
		<IconButton
			icon={leadingIcon}
			ariaLabel={leadingLabel}
			onClick={onLeading}
			size="lg"
			disabled={leadingDisabled}
		/>
	{/if}
	<div class="panel-header__identity">
		{#if eyebrow}<p class="panel-header__eyebrow">{eyebrow}</p>{/if}
		<svelte:element
			this={variant === "panel" ? "h1" : "h2"}
			class="panel-header__title"
			{title}
		>
			{title}
			{#if help}
				<span class="panel-header__help" use:tooltipAction={help}>
					<Icon name="fa-circle-question" size="md" tone="muted" />
				</span>
			{/if}
		</svelte:element>
		<slot name="subtitle" />
	</div>
	<div class="panel-header__trailing">
		<slot name="trailing" />
	</div>
</header>

<style lang="scss">
	.panel-header {
		display: flex;
		align-items: flex-start;
		gap: var(--gutter-md);
		margin: 0 var(--gutter-lg);
	}

	.panel-header--section {
		align-items: center;
		margin: 0;
	}

	.panel-header__identity {
		flex: 1 1 auto;
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	.panel-header__eyebrow {
		margin: 0;
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.panel-header__title {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-sm);
		margin: 0;
		font-size: var(--font-size-3xl);
		font-weight: var(--font-weight-medium);
		line-height: 1.08;
		overflow-wrap: anywhere;
	}

	.panel-header--section .panel-header__title {
		font-size: var(--font-size-lg);
	}

	.panel-header__help {
		display: inline-flex;
		cursor: help;
	}

	.panel-header__trailing {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
	}
</style>
