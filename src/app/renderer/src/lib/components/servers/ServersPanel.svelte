<script lang="ts">
	import { navigation, rememberNavigation, navigationScroll } from "$lib/navigation/navigation"
	import { onMount } from "svelte"
	import type {
		GameServerListMeta,
		GameServerParam,
		GameServerPatch,
		GameServerProfile,
		GameServerRecord
	} from "$lib/core"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents";
	import { getServerLabel } from "$lib/utils/displayNames";
	import {
		deleteServer,
		getServer,
		restoreServer,
		updateServer,
		updateServerVariables
	} from "$lib/utils/gameServersApi"
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import ServerArchive from "./ServerArchive.svelte";
	import ServerEditor from "./ServerEditor.svelte";
	import PlayerDetailPanel from '$lib/components/players/PlayerDetailPanel.svelte'
	import type { PlayerState } from '$lib/types/playerState'

	const SERVER_ARCHIVE_REFRESH_MS = 20_000

	export let hidden = false;
	export let isActive = false;
	export let onOpenTeam: (teamId: number) => void
	export let requestedYoursRequestId: number | null = null
	export let onRequestedYoursHandled: (requestId: number) => void = () => {}

	let editingServer: GameServerRecord | null = null
	let selectedPlayer: PlayerState | null = null
	let editingProfile: GameServerProfile | null = null
	let editorError: string | null = null
	let detailLoading = false
	let editorVersion = 0
	let saving = false;
	let loading = false;
	let refreshRevision = 0;
	let now = Date.now();
	let nextRefreshAt = now + SERVER_ARCHIVE_REFRESH_MS;
	let meta: GameServerListMeta = { currentPage: 1, pageSize: 100, totalPages: 0, totalResults: 0, hasPrevious: false, hasNext: false };

	onMount(() => {
		const refreshTimer = window.setInterval(() => {
			if (isActive && !editingServer && !loading && !saving) triggerRefresh()
		}, SERVER_ARCHIVE_REFRESH_MS)
		const countdownTimer = window.setInterval(() => (now = Date.now()), 1000)

		return () => {
			window.clearInterval(refreshTimer)
			window.clearInterval(countdownTimer)
		}
	})

	$: refreshIn = Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));
	$: if (isActive && !editingServer && !loading && !saving && refreshIn === 0) triggerRefresh();

	function triggerRefresh(): void {
		refreshRevision += 1;
		now = Date.now();
		nextRefreshAt = now + SERVER_ARCHIVE_REFRESH_MS;
	}

	async function save(patch: GameServerPatch): Promise<void> {
		if (!editingServer) return;
		saving = true;
		try {
			await updateServer(editingServer.id, patch);
			notifySuccess("Server saved.");
			closeEditor()
			triggerRefresh();
		} catch (error) {
			notifyError(message(error, "Server save failed."));
		} finally { saving = false; }
	}

	async function openEditor(server: GameServerRecord): Promise<void> {
		const version = ++editorVersion
		editingServer = server
		editingProfile = null
		editorError = null
		detailLoading = true

		try {
			const profile = await getServer(server.id)
			if (version === editorVersion && editingServer?.id === server.id) editingProfile = profile
		} catch (error) {
			if (version === editorVersion) editorError = message(error, `Server request failed.`)
		} finally {
			if (version === editorVersion) detailLoading = false
		}
	}

	function closeEditor(): void {
		selectedPlayer = null
		editorVersion += 1
		saving = false
		editingServer = null
		editingProfile = null
		editorError = null
		detailLoading = false
	}

	async function saveVariables(variables: GameServerParam[]): Promise<void> {
		if (!editingServer || !editingProfile?.canEditVariables) return
		const serverId = editingServer.id
		const version = editorVersion
		saving = true
		try {
			const saved = await updateServerVariables(serverId, variables.map((variable, index) => ({
				label: variable.label,
				value: variable.value,
				sortOrder: index
			})))
			if (version !== editorVersion || editingServer?.id !== serverId || !editingProfile) return
			editingProfile = { ...editingProfile, variables: saved }
			notifySuccess(`Server variables saved.`)
		} catch (error) {
			if (version === editorVersion) notifyError(message(error, `Server variable save failed.`))
		} finally {
			if (version === editorVersion) saving = false
		}
	}

	async function remove(server: GameServerRecord): Promise<void> {
		await mutate(server, deleteServer, "Server hidden.", "Server delete failed.");
	}
	async function restore(server: GameServerRecord): Promise<void> {
		await mutate(server, restoreServer, "Server restored.", "Server restore failed.");
	}
	async function mutate(server: GameServerRecord, action: (id: number) => Promise<void>, success: string, failure: string): Promise<void> {
		saving = true;
		try {
			await action(server.id);
			notifySuccess(success);
			triggerRefresh();
		} catch (error) {
			notifyError(message(error, failure));
		} finally { saving = false; }
	}
	function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
	rememberNavigation(`serverDetail`, () => ({ editingServer, selectedPlayer }), async (state, isCurrent) => {
		if (!state.editingServer) closeEditor()
		else if (state.editingServer.id !== editingServer?.id) await openEditor(state.editingServer)
		if (isCurrent()) selectedPlayer = state.selectedPlayer
	}, state => [state.editingServer?.id, state.selectedPlayer?.playfabId])
</script>

<section {hidden} class="panel-view servers-view" class:servers-view--player={selectedPlayer !== null} aria-label="Servers">
	{#if selectedPlayer}
		<PlayerDetailPanel player={selectedPlayer} backLabel="Back to server players" onBack={() => (selectedPlayer = null)} notice="This server’s player list is matched by nickname." />
	{/if}
	{#if !selectedPlayer}
	<PanelHeader title={editingServer ? getServerLabel(editingServer) : "Servers"} eyebrow={editingServer ? "Edit server" : `${meta.totalResults} servers`} leadingIcon={editingServer ? "fa-arrow-left" : null} leadingLabel="Back to servers" onLeading={editingServer ? closeEditor : null}>
		<svelte:fragment slot="trailing">
			{#if !editingServer}
				<IconButton icon="fa-rotate" ariaLabel="Refresh servers" tooltip="Refresh servers" disabled={loading || saving} onClick={triggerRefresh} />
				<span>{meta.currentPage} / {Math.max(1, meta.totalPages)}</span>
				<time>Refresh in {refreshIn}s</time>
			{/if}
		</svelte:fragment>
	</PanelHeader>
	{/if}

	<div class="servers-view__body" use:navigationScroll={`servers-view__body`} hidden={selectedPlayer !== null}>
		{#if editingServer}
			<ServerEditor
				server={editingServer}
				profile={editingProfile}
				{onOpenTeam}
				{detailLoading}
				detailError={editorError}
				{saving}
				active={isActive && !selectedPlayer}
				onSelectPlayer={player => void navigation.visit(() => { selectedPlayer = player })}
				onSave={save}
				onSaveVariables={variables => void saveVariables(variables)}
				onRetry={() => void openEditor(editingServer!)}
				onCancel={closeEditor}
			/>
		{/if}
		<ServerArchive hidden={Boolean(editingServer)} active={isActive && !editingServer} {refreshRevision} busy={saving} {requestedYoursRequestId} {onRequestedYoursHandled} onEdit={server => void navigation.visit(() => openEditor(server))} onDelete={remove} onRestore={restore} onResult={(result) => { meta = result.meta; loading = result.loading; if (result.refreshedAt) { now = Date.now(); nextRefreshAt = now + SERVER_ARCHIVE_REFRESH_MS; } }} />
	</div>
</section>

<style lang="scss">
	.servers-view { box-sizing: border-box; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); padding-top: var(--gutter-lg); }
	.servers-view__body { min-height: 0; display: grid; }
	.servers-view__body[hidden] { display: none; }
	.servers-view--player { grid-template-rows: minmax(0, 1fr); padding-top: 0; }
</style>
