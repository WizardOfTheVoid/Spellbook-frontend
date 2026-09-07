<script lang="ts">
	import type { PlayerAction } from "$lib/core";
	import DetailedTooltip from "$lib/components/ui/DetailedTooltip.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import { formatOffenseType } from "$lib/utils/formatOffenseType"
	import {
		actionAuthorWithTeam,
		actionServer,
		formatActionType,
		formatServedDuration,
	} from "$lib/utils/playerActions";

	export let action: PlayerAction;
	export let actions: readonly PlayerAction[];
	console.log(action, actions);
	$: rows = [
		{ icon: `fa-user`, key: `Author`, value: actionAuthorWithTeam(action) },
		{
			icon: `fa-clock`,
			key: `Duration`,
			value: formatServedDuration(action, actions),
		},
		{
			icon: `fa-gavel`,
			key: `Reason`,
			value: action.reason?.trim() || `None`,
		},
	];

</script>

<DetailedTooltip title={`${formatActionType(action.actionType)}: ${formatOffenseType(action.offenseType)}`} subtitle={actionServer(action)}>
	{#snippet content()}
		<dl class="offense-details">
			{#each rows as row (row.key)}
				<div class="offense-details__row">
					<dt><Icon name={row.icon} size="md" /><span>{row.key}:</span></dt>
					<dd>{row.value}</dd>
				</div>
			{/each}
		</dl>
	{/snippet}
</DetailedTooltip>

<style lang="scss">
	.offense-details {
		display: grid;
		gap: var(--gutter-sm);
		margin: 0;
	}

	.offense-details__row {
		display: flex;
		align-items: baseline;
		gap: var(--gutter-sm);
	}

	dt {
		display: inline-flex;
		align-items: center;
		gap: var(--gutter-md);
		flex-shrink: 0;
		font-weight: var(--font-weight-medium);
	}

	dd {
		min-width: 0;
		margin: 0;
		color: var(--color-light-tertiary);
	}
</style>
