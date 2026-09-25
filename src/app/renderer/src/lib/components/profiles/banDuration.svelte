<script lang="ts">
	import Range from "$lib/components/ui/Range.svelte";
	import { formatDuration } from './formatDuration'
	import IconButton from "$lib/components/ui/IconButton.svelte";

	export let value = 24;
	export let steps: readonly number[] = [];
	export let allowOutOfStep = false;
	export let disabled = false;
	export let onChange: (value: number) => void;
</script>

<div class="ban-duration">
	<Range
		label="Duration (hours)"
		min={1}
		max={1337}
		{value}
		{disabled}
		{steps}
		allow-out-of-step={allowOutOfStep}
		natural-step-spacing={true}
		formatCurrentValue={formatDuration}
		{onChange}
	/>
	<span class="maximum-button">
		<IconButton
			icon="fa-infinity"
			iconSize="sm"
			ariaLabel="Set maximum ban duration"
			tooltip="MAX"
			size="sm"
			{disabled}
			active={value === 999999}
			hasPopup={null}
			onClick={() => onChange(999999)}
		/>
	</span>
</div>

<style lang="scss">
	.maximum-button {
		--control-height-sm: 28px;
		align-self: end;
		height: var(--control-height-md);
		display: flex;
		align-items: center;
	}
	.ban-duration {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--gutter-sm);
		min-width: 0;
	}
</style>
