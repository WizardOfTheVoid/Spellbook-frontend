<script lang="ts">
	import { navigation, rememberNavigation, navigationScroll } from "$lib/navigation/navigation"
	import type {
		GameServerParam,
		GameServerPatch,
		GameServerProfile,
		GameServerRecord
	} from "$lib/core"
	import Tabs from "$lib/components/ui/tabs.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import Button from "$lib/components/ui/Button.svelte"
	import Input from "$lib/components/ui/Input.svelte"
	import ServerVariablesEditor from "./ServerVariablesEditor.svelte"
	import GameServerPlayers from './GameServerPlayers.svelte'
	import type { PlayerState } from '$lib/types/playerState'

	export let server: GameServerRecord
	export let profile: GameServerProfile | null = null
	export let detailLoading = false
	export let detailError: string | null = null
	export let saving = false
	export let active = true
	export let onSelectPlayer: (player: PlayerState) => void
	export let onSave: (patch: GameServerPatch) => void
	export let onSaveVariables: (variables: GameServerParam[]) => void
	export let onRetry: () => void
	export let onCancel: () => void
	export let onOpenTeam: (teamId: number) => void

	type ServerEditorView = `details` | `variables` | `players`

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
	$: detailsDisabled = saving || variablesDisabled
	$: variablesTooltip = getVariablesTooltip()
	$: tabs = [
		{ value: `details`, label: `Details` },
		...(profile?.canViewPlayers ? [{ value: `players`, label: `Players` }] : []),
		{ value: `variables`, label: `Variables`, disabled: variablesDisabled, tooltip: variablesTooltip }
	]
	$: if (view === `players` && profile && !profile.canViewPlayers) view = `details`

	function saveDetails(): void {
		if (detailsDisabled) return
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
	rememberNavigation(`serverTab`, () => view, value => { view = value })
</script>

<div class="server-editor panel-subview" use:navigationScroll={`serverEditor`}>
	<Tabs items={tabs} value={view} label="Server profile" onChange={value => void navigation.visit(() => { view = value as ServerEditorView })}>

	{#if detailLoading}
		<small>Loading server details...</small>
	{:else if detailError}
		<div class="server-editor__detail-error">
			<small>{detailError}</small>
			<Button label="Retry" disabled={saving} onClick={onRetry} />
		</div>
	{/if}

	{#if view === `details`}
		<form class="server-editor__section" on:submit|preventDefault={saveDetails}>
			<PanelHeader variant="section" title="Details">
				<svelte:fragment slot="trailing">
					{#if profile?.ownerTeamId}<Button label="Team" icon="fa-users" onClick={() => onOpenTeam(profile!.ownerTeamId!)} />{/if}
				</svelte:fragment>
			</PanelHeader>
			<div class="server-editor__raw">
				<Input label="Reported name" value={server.name} disabled />
				<small>Set by the game server. Used to match profiles, so it cannot be edited here.</small>
			</div>

			<Input label="Server name" value={displayName} disabled={detailsDisabled} maxlength={255} onChange={value => (displayName = value)} />
			<Input label="Clan name" value={clanName} disabled={detailsDisabled} maxlength={255} onChange={value => (clanName = value)} />
			<Input label="Clan tag" value={clanTag} disabled={detailsDisabled} maxlength={32} onChange={value => (clanTag = value)} />

			<div class="server-editor__actions">
				<Button label="Cancel" disabled={saving} onClick={onCancel} />
				<Button label="Save" variant="primary" icon="fa-floppy-disk" disabled={detailsDisabled} onClick={saveDetails} />
			</div>
		</form>
	{:else if view === `players`}
		{#key server.id}
			<GameServerPlayers gameServerId={server.id} {active} onSelect={onSelectPlayer} />
		{/key}
	{:else}
		{#if variablesDisabled}<p role="status">{variablesTooltip}</p>{/if}
		<ServerVariablesEditor
			variables={variableDraft}
			saving={saving || variablesDisabled}
			onChange={variables => (variableDraft = variables)}
			onErrorChange={hasError => (variableError = hasError)}
		/>
		<div class="server-editor__actions">
			<Button label="Cancel" disabled={saving} onClick={onCancel} />
			<Button
				label="Save variables"
				variant="primary"
				icon="fa-floppy-disk"
				disabled={saving || variablesDisabled || variableError}
				onClick={saveVariables}
			/>
		</div>
	{/if}
	</Tabs>
</div>

<style lang="scss">
	.server-editor {
		min-width: 0;
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}

	.server-editor__section { display: grid; gap: var(--gutter-lg); }

	.server-editor__actions,
	.server-editor__detail-error {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
	}

	.server-editor__raw {
		display: grid;
		gap: var(--gutter-sm);
		margin: 0;
		color: var(--color-text-secondary);
	}

	.server-editor__detail-error {
		justify-content: space-between;
		color: var(--color-danger-primary);
	}

	.server-editor__actions {
		justify-content: flex-end;
	}
</style>
