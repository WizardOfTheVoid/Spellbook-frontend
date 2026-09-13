<script lang="ts">
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

<div class="profile-screen grid-stack gap-125">
	<section class="profile-card grid-stack gap-125">
		<div class="profile-card-header">
			<h2>Fixed variables</h2>
			<small>Always available</small>
		</div>
		{#each FIXED_SERVER_VARIABLES as fixedVariable, index (fixedVariable.key)}
			<label>
				<span>{fixedVariable.label}</span>
				<input
					type="text"
					maxlength="255"
					disabled={saving}
					value={fixed[index]?.value ?? ``}
					on:input={(event) =>
						setFixedValue(fixedVariable.key, event.currentTarget.value)}
				/>
				<small>[{fixedVariable.key}]</small>
			</label>
		{/each}
	</section>

	<section class="profile-card grid-stack gap-125">
		<div class="profile-card-header">
			<h2>Custom variables</h2>
			<button type="button" on:click={addVariable} disabled={saving}
				>Add variable</button
			>
		</div>
		{#each custom as variable, index (index)}
			<div class="variable-row">
				<label>
					<span>Name</span>
					<input
						type="text"
						maxlength="64"
						placeholder="Rules URL"
						disabled={saving}
						value={variable.label}
						on:input={(event) =>
							setCustomLabel(index, event.currentTarget.value)}
					/>
				</label>
				<label>
					<span>Value</span>
					<input
						type="text"
						maxlength="255"
						disabled={saving}
						value={variable.value}
						on:input={(event) =>
							setCustomValue(index, event.currentTarget.value)}
					/>
				</label>
				<button
					type="button"
					class="danger"
					on:click={() => removeVariable(index)}
					disabled={saving}>Remove</button
				>
				<small class:variable-error={errors[index]}
					>{errors[index] ?? `[${variable.key}]`}</small
				>
			</div>
		{:else}
			<small>No custom variables yet.</small>
		{/each}
		<small
			>Renaming a variable changes its tag. Messages using the old tag are not
			updated.</small
		>
	</section>
</div>

<style>
	.variable-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
		align-items: end;
		gap: 8px;
	}

	.variable-row small {
		grid-column: 1 / -1;
		color: var(--color-text-secondary);
		font-size: 12px;
		font-weight: var(--font-weight-bold);
	}

	.variable-error {
		color: #ffb7ae;
	}

	.variable-row button.danger {
		border-color: rgba(239, 111, 99, 0.45);
		color: #ffb7ae;
	}
</style>
