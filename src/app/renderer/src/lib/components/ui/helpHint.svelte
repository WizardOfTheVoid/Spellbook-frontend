<script lang="ts">
	import Icon from "./Icon.svelte";
	import { tooltip } from "$lib/utils/tooltip";

	export let text: string;
</script>

<button type="button" class="help-hint" aria-label={text} use:tooltip={text}>
	<Icon name="fa-circle-question" size="md" type="thin" />
</button>

<style lang="scss">
	.help-hint {
		border: 0;
		padding: 0;
		background: transparent;
		display: inline-flex;
		align-items: center;
		vertical-align: middle;
		margin-inline-start: var(--gutter-sm);
		color: var(--color-light-tertiary);
		cursor: help;
		border-radius: 50%;
	}

	.help-hint:focus-visible {
		outline: 2px solid var(--color-accent-primary);
		outline-offset: 2px;
	}
</style>
