<script lang="ts">
	import type {
		RulesetRule,
		RuleDefinition,
		RuleOperator,
	} from "@spellbook/shared/rulesets/rulesetTypes";
	import type { ServerProfileAction } from "$lib/core";
	import Input from "$lib/components/ui/Input.svelte";
	import Select from "$lib/components/ui/Select.svelte";
	import RadioGroup from "$lib/components/ui/RadioGroup.svelte";
	import InfoNotice from "$lib/components/ui/infoNotice.svelte";
	import Toggle from "$lib/components/ui/Toggle.svelte";
	import RuleDateEditor from "./ruleDateEditor.svelte";
	import {
		actionKeyForScope,
		ruleActionWarning,
		ruleRunScope,
	} from "./rulesetEditor";
	export let rule: RulesetRule;
	export let definitions: RuleDefinition[];
	export let actions: ServerProfileAction[];
	export let disabled = false;
	export let zone: string | null = null;
	export let dateError = ``;
	let runFor: ServerProfileAction[`actionDomain`] =
		ruleRunScope(rule, actions) ?? `server`;
	$: definition =
		rule.condition.mode === `if` ?
			definitions.find(
				(item) =>
					rule.condition.mode === `if` &&
					item.key === rule.condition.definition,
			)
		:	null;
	$: selectedAction = actions.find(
		(action) => action.actionKey === rule.actionKey,
	);
	$: if (selectedAction) runFor = selectedAction.actionDomain;
	$: actionOptions = actions.filter((action) =>
		rule.condition.mode === `each` ?
			action.actionDomain === runFor
		:	!definition || action.actionDomain === definition.domain,
	);
	$: warning = ruleActionWarning(rule, selectedAction);
	$: warningMessage =
		warning?.broadcastCount ?
			`This action contains ${warning.broadcastCount} chat message command${warning.broadcastCount === 1 ? `` : `s`}. It can send them for each ${warning.perPlayer ? `server` : `matching`} player, thus messages may repeat.`
		: warning?.perPlayer ? `This action can be queued once for every player.`
		: ``;
	$: if (definition?.valueType !== `date` && definition?.valueType !== `time`)
		dateError = ``;
	function mode(value: string) {
		rule.condition =
			value === `each` ?
				{ mode: `each`, amount: 1, unit: `minute` }
			:	{
					mode: `if`,
					definition: `Player.rank`,
					operator: `<`,
					value: 50,
					triggerOnce: true,
				};
		runFor = `server`;
		rule.actionKey = actionKeyForScope(
			rule.actionKey,
			value === `each` ? `server` : `player`,
			actions,
		);
	}
</script>

<section class="rule-editor">
	<Input
		label="Name"
		value={rule.name}
		onChange={(value) => (rule.name = value)}
		{disabled}
	/>
	<Input
		label="Description"
		value={rule.description}
		onChange={(value) => (rule.description = value)}
		{disabled}
	/>
	<fieldset class="rule-editor__conditions">
		<legend>Conditions</legend>
		<Select
			label="When"
			value={rule.condition.mode}
			options={[
				{ value: `if`, label: `IF` },
				{ value: `each`, label: `Every` },
			]}
			onChange={mode}
			{disabled}
		/>
		{#if rule.condition.mode === `if`}
			<div class="rule-editor__row rule-editor__row--condition">
				<Select
					label="Condition"
					value={rule.condition.definition}
					options={definitions.map((item) => ({
						value: item.key,
						label: item.label,
					}))}
					{disabled}
					onChange={(value) => {
						const next = definitions.find((item) => item.key === value)!;
						rule.condition = {
							...rule.condition,
							mode: `if`,
							definition: next.key,
							operator: next.operators[0]!,
							value: next.valueType === `number` ? 0 : ``,
						};
						rule.actionKey = actionKeyForScope(
							rule.actionKey,
							next.domain,
							actions,
						);
					}}
				/>
				<Select
					label="Comparison"
					value={rule.condition.operator}
					options={(definition?.operators ?? []).map((value) => ({
						value,
						label: value === `<` ? `Less (<)` : value,
					}))}
					{disabled}
					onChange={(value) => {
						if (rule.condition.mode === `if`)
							rule.condition.operator = value as RuleOperator;
					}}
				/>
				{#if definition?.valueType === `date` || definition?.valueType === `time`}
					{#key definition.key}
						<RuleDateEditor
							kind={definition.valueType}
							value={String(rule.condition.value)}
							{zone}
							{disabled}
							bind:error={dateError}
							onChange={(value) => {
								if (rule.condition.mode === `if`) rule.condition.value = value;
							}}
						/>
					{/key}
				{:else}
					<Input
						label={`Value${definition?.unit ? ` (${definition.unit})` : ``}`}
						type={definition?.valueType === `number` ? `number` : `text`}
						value={rule.condition.value}
						{disabled}
						onChange={(value) => {
							if (rule.condition.mode === `if`)
								rule.condition.value =
									definition?.valueType === `number` ? Number(value) : value;
						}}
					/>
				{/if}
			</div>
			<Toggle
				label="Trigger once"
				checked={rule.condition.triggerOnce ?? false}
				description="Perform the action once while the condition is true. Allow it to trigger again after the condition becomes false."
				{disabled}
				onChange={(value) => {
					if (rule.condition.mode === `if`) rule.condition.triggerOnce = value;
				}}
			/>
		{:else}
			<div class="rule-editor__row rule-editor__row--interval">
				<Input
					label="Interval"
					type="number"
					min={1}
					value={rule.condition.amount}
					{disabled}
					onChange={(value) => {
						if (rule.condition.mode === `each`)
							rule.condition.amount = Number(value);
					}}
				/>
				<Select
					label="Unit"
					value={rule.condition.unit}
					options={[
						{ value: `minute`, label: `Minutes` },
						{ value: `hour`, label: `Hours` },
					]}
					{disabled}
					onChange={(value) => {
						if (rule.condition.mode === `each`)
							rule.condition.unit = value as `minute` | `hour`;
					}}
				/>
			</div>
		{/if}
	</fieldset>
	{#if rule.condition.mode === `each`}
		<RadioGroup
			label="Run behavior"
			variant="cards"
			value={runFor}
			options={[
				{
					value: `server`,
					label: `Trigger once`,
					description: `Queue action once per interval`,
				},
				{
					value: `player`,
					label: `Each server player`,
					description: `Queue per player in the server`,
				},
			]}
			{disabled}
			onChange={(value) => {
				runFor = value as ServerProfileAction[`actionDomain`];
				rule.actionKey = actionKeyForScope(rule.actionKey, runFor, actions);
			}}
		/>
	{/if}
	<Select
		label="Perform action"
		value={rule.actionKey}
		options={actionOptions.map((action) => ({
			value: action.actionKey ?? ``,
			label: action.label,
		}))}
		placeholder="Choose an action"
		required
		tone={warning ? `warning` : `default`}
		{disabled}
		onChange={(value) => (rule.actionKey = value)}
	/>
	{#if warning}<InfoNotice
			icon="fa-triangle-exclamation"
			message={warningMessage}
		/>{/if}
</section>

<style>
	.rule-editor {
		display: grid;
		gap: var(--gutter-md);
		padding: var(--gutter-md);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
		background: var(--color-dark-primary);
		min-width: 0;
	}
	.rule-editor__conditions {
		display: grid;
		gap: var(--gutter-md);
		min-width: 0;
		margin: 0;
		padding: var(--gutter-md);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius);
	}
	legend {
		padding: 0 var(--gutter-sm);
		font-size: var(--font-size-sm);
	}
	.rule-editor__row {
		display: grid;
		align-items: end;
		gap: var(--gutter-md);
		min-width: 0;
	}
	.rule-editor__row--condition {
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr);
	}
	.rule-editor__row--interval {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}
</style>
