<script lang="ts">
	import type {
		GameServerParam,
		GameServerPatch,
		GameServerProfile,
		GameServerRecord
	} from "$lib/core"
	import { tooltip as tooltipAction } from "$lib/utils/tooltip"
	import Button from "$lib/components/ui/Button.svelte"
	import Input from "$lib/components/ui/Input.svelte"
	import ServerVariablesEditor from "./ServerVariablesEditor.svelte"

	export let server: GameServerRecord
	export let profile: GameServerProfile | null = null
	export let detailLoading = false
	export let detailError: string | null = null
	export let saving = false
	export let onSave: (patch: GameServerPatch) => void
	export let onSaveVariables: (variables: GameServerParam[]) => void
	export let onRetry: () => void
	export let onCancel: () => void

	type ServerEditorView = `details` | `variables`

	let view: ServerEditorView = `details`
	let displayName = server.displayName ?? ``
	let clanName = server.clanName ?? ``
	let clanTag = server.clanTag ?? ``
	let variableDraft: GameServerParam[] = []
	let variableError = false
	let loadedServerId = server.id
	let loadedProfile: GameServerProfile | null = null

	$: if (server.id !== loadedServerId) {
		loadedServerId = server.id
		view = `details`
		displayName = server.displayName ?? ``
		clanName = server.clanName ?? ``
		clanTag = server.clanTag ?? ``
	}

	$: if (profile !== loadedProfile) {
		loadedProfile = profile
		variableDraft = profile?.variables.map(variable => ({ ...variable })) ?? []
		variableError = false
	}

	$: variablesDisabled = detailLoading || !profile || !profile.canEditVariables
	$: variablesTooltip = getVariablesTooltip()

	function saveDetails(): void {
		onSave({
			displayName: trimmed(displayName),
			clanName: trimmed(clanName),
			clanTag: trimmed(clanTag)
		})
	}

	function saveVariables(): void {
		if (variablesDisabled || variableError) return
		onSaveVariables(variableDraft)
	}

	function openVariables(): void {
		if (!variablesDisabled) view = `variables`
	}

	function getVariablesTooltip(): string {
		if (detailLoading) return `Loading server details.`
		if (!profile) return detailError ?? `Server details unavailable.`
		if (profile.canEditVariables) return ``
		if (profile.assignment) {
			return `Editing server variables requires profile edit permission. Contact the team leader.`
		}
		return `This server is not assigned to a profile. Contact a team leader to assign it.`
	}

	function trimmed(value: string): string | null {
		return value.trim() || null
	}
</script>

<div class="server-editor panel-subview grid-stack gap-125">
	<nav class="server-editor__tabs" aria-label="Server editor sections">
		<button type="button" aria-pressed={view === `details`} on:click={() => (view = `details`)}>Details</button>
		<!-- The wrapper remains focusable so keyboard users receive the disabled-button reason. -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<span
			class="server-editor__tooltip-target"
			tabindex={variablesTooltip ? 0 : undefined}
			use:tooltipAction={variablesTooltip}
		>
			<button
				type="button"
				aria-pressed={view === `variables`}
				disabled={variablesDisabled}
				on:click={openVariables}
			>Variables</button>
		</span>
	</nav>

	{#if detailLoading}
		<small>Loading server details...</small>
	{:else if detailError}
		<div class="server-editor__detail-error">
			<small>{detailError}</small>
			<Button label="Retry" disabled={saving} onClick={onRetry} />
		</div>
	{/if}

	{#if view === `details`}
		<form class="grid-stack gap-125" on:submit|preventDefault={saveDetails}>
			<p class="server-editor__raw">
				<span>Reported name</span>
				<code>{server.name}</code>
				<small>Set by the game server. Used to match profiles, so it cannot be edited here.</small>
			</p>

			<Input label="Server name" value={displayName} disabled={saving} maxlength={255} onChange={value => (displayName = value)} />
			<Input label="Clan name" value={clanName} disabled={saving} maxlength={255} onChange={value => (clanName = value)} />
			<Input label="Clan tag" value={clanTag} disabled={saving} maxlength={32} onChange={value => (clanTag = value)} />

			<div class="server-editor__actions">
				<Button label="Cancel" disabled={saving} onClick={onCancel} />
				<Button label="Save" variant="primary" icon="fa-floppy-disk" disabled={saving} onClick={saveDetails} />
			</div>
		</form>
	{:else}
		<ServerVariablesEditor
			variables={variableDraft}
			{saving}
			onChange={variables => (variableDraft = variables)}
			onErrorChange={hasError => (variableError = hasError)}
		/>
		<div class="server-editor__actions">
			<Button label="Cancel" disabled={saving} onClick={onCancel} />
			<Button
				label="Save variables"
				variant="primary"
				icon="fa-floppy-disk"
				disabled={saving || variableError}
				onClick={saveVariables}
			/>
		</div>
	{/if}
</div>

<style lang="scss">
	.server-editor__tabs,
	.server-editor__actions,
	.server-editor__detail-error {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
	}

	.server-editor__tabs button[aria-pressed="true"] {
		border-color: var(--color-accent-primary);
		color: var(--color-light-primary);
	}

	.server-editor__tooltip-target {
		display: inline-flex;
	}

	.server-editor__raw {
		display: grid;
		gap: var(--gutter-sm);
		margin: 0;
		color: var(--color-text-secondary);
	}

	.server-editor__raw code {
		overflow-wrap: anywhere;
	}

	.server-editor__detail-error {
		justify-content: space-between;
		color: var(--color-danger-primary);
	}

	.server-editor__actions {
		justify-content: flex-end;
	}
</style>
