<script lang="ts">
	import Input from "$lib/components/ui/Input.svelte"
	import Button from "$lib/components/ui/Button.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import type { GameServerParam } from "$lib/core";
	import {
		FIXED_SERVER_VARIABLES,
		customVariableRows,
		fixedVariableRows,
		serverVariableKeyError,
		slugServerVariableLabel,
	} from "$lib/utils/serverVariables";

	export let variables: GameServerParam[] = [];
	export let saving = false;
	export let onChange: (variables: GameServerParam[]) => void;
	export let onErrorChange: (hasError: boolean) => void = () => {};

	$: fixed = fixedVariableRows(variables);
	$: custom = customVariableRows(variables);
	$: errors = custom.map((variable, index) =>
		serverVariableKeyError(
			variable.label,
			custom.filter((_, other) => other !== index).map((other) => other.key),
		),
	);
	$: onErrorChange(errors.some((error) => error !== null));

	function emit(nextCustom: GameServerParam[]): void {
		onChange(
			[...fixed, ...nextCustom].map((variable, index) => ({
				...variable,
				sortOrder: index,
			})),
		);
	}

	function setFixedValue(key: string, value: string): void {
		onChange(
			[
				...fixed.map((variable) =>
					variable.key === key ? { ...variable, value } : variable,
				),
				...custom,
			].map((variable, index) => ({ ...variable, sortOrder: index })),
		);
	}

	function setCustomLabel(index: number, label: string): void {
		emit(
			custom.map((variable, itemIndex) =>
				itemIndex === index ?
					{ ...variable, label, key: slugServerVariableLabel(label) }
				:	variable,
			),
		);
	}

	function setCustomValue(index: number, value: string): void {
		emit(
			custom.map((variable, itemIndex) =>
				itemIndex === index ? { ...variable, value } : variable,
			),
		);
	}

	function addVariable(): void {
		emit([
			...custom,
			{
				id: 0,
				gameServerId: variables[0]?.gameServerId ?? 0,
				label: ``,
				key: ``,
				value: ``,
				sortOrder: 0,
			},
		]);
	}

	function removeVariable(index: number): void {
		emit(custom.filter((_, itemIndex) => itemIndex !== index));
	}
</script>

<section class="server-variables" aria-label="Server variables">
	<section class="server-variables__section">
		<PanelHeader variant="section" title="Fixed variables">
			<svelte:fragment slot="trailing"><small>Always available</small></svelte:fragment>
		</PanelHeader>
		{#each FIXED_SERVER_VARIABLES as fixedVariable, index (fixedVariable.key)}
			<Input label={fixedVariable.label} value={fixed[index]?.value ?? ``} maxlength={255} disabled={saving} hint={`[${fixedVariable.key}]`} onChange={value => setFixedValue(fixedVariable.key, value)} />
		{/each}
	</section>
	<section class="server-variables__section">
		<PanelHeader variant="section" title="Custom variables">
			<svelte:fragment slot="trailing"><Button label="Add variable" icon="fa-plus" disabled={saving} onClick={addVariable} /></svelte:fragment>
		</PanelHeader>
		{#each custom as variable, index (index)}
			<div class="variable-row">
				<Input label="Name" value={variable.label} maxlength={64} placeholder="Rules URL" disabled={saving} onChange={value => setCustomLabel(index, value)} />
				<Input label="Value" value={variable.value} maxlength={255} disabled={saving} onChange={value => setCustomValue(index, value)} />
				<Button label="Remove" variant="danger" disabled={saving} onClick={() => removeVariable(index)} />
				<small class:variable-error={errors[index]}>{errors[index] ?? `[${variable.key}]`}</small>
			</div>
		{:else}
			<small>No custom variables yet.</small>
		{/each}
		<small>Renaming a variable changes its tag. Messages using the old tag are not updated.</small>
	</section>
</section>

<style lang="scss">
	.server-variables,
	.server-variables__section { min-width: 0; display: grid; gap: var(--gutter-lg); }
	.variable-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: end; gap: var(--gutter-md); }
	small { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	.variable-row small { grid-column: 1 / -1; }
	.variable-error { color: var(--color-danger-primary); }
	@media (max-width: 600px) { .variable-row { grid-template-columns: minmax(0, 1fr); } }
</style>
