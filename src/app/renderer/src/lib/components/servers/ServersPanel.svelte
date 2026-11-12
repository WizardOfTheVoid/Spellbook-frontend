<script lang="ts">
	import { navigation, rememberNavigation, navigationScroll } from "$lib/navigation/navigation"
	import { onMount } from "svelte"
	import type {
		GameServerListMeta,
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
		updateServer
	} from "$lib/utils/gameServersApi"
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import ServerArchive from "./ServerArchive.svelte";
	import ServerEditor from "./ServerEditor.svelte";
	import ServerNameModal from './serverNameModal.svelte'
	import PlayerDetailPanel from '$lib/components/players/PlayerDetailPanel.svelte'
	import type { PlayerState } from '$lib/types/playerState'
	import { unsavedChanges } from '$lib/utils/unsavedChanges'

	const SERVER_ARCHIVE_REFRESH_MS = 20_000

	export let hidden = false;
	export let isActive = false;
	export let requestedYoursRequestId: number | null = null
	export let onRequestedYoursHandled: (requestId: number) => void = () => {}
	export let requestedServer: { id: number, requestId: number } | null = null
	export let onRequestedServerHandled: (requestId: number) => void = () => {}
	export let onOpenServer: (serverId: number) => void = () => {}
	let handledServerRequest = 0

	let editingServer: GameServerRecord | null = null
	let selectedPlayer: PlayerState | null = null
	let editingProfile: GameServerProfile | null = null
	let editorError: string | null = null
	let detailLoading = false
	let editorVersion = 0
	let renaming = false
	let renameButton: HTMLButtonElement | null = null
	let saving = false;
	let loading = false;
	let totalServers = 0
	let refreshRevision = 0;
	let now = Date.now();
	let nextRefreshAt = now + SERVER_ARCHIVE_REFRESH_MS;
	let meta: GameServerListMeta = { currentPage: 1, pageSize: 100, totalPages: 0, totalResults: 0, hasPrevious: false, hasNext: false };
	$: if (!isActive || hidden || !editingProfile?.canEditDetails) renaming = false
	$: if (requestedServer && requestedServer.requestId !== handledServerRequest) {
		handledServerRequest = requestedServer.requestId
		void showRequestedServer(requestedServer)
	}

	async function showRequestedServer(request: { id: number, requestId: number }): Promise<void> {
		selectedPlayer = null
		try {
			const profile = await getServer(request.id)
			if (request.requestId !== handledServerRequest) return
			await openEditor(profile.gameServer, profile)
		} catch (error) {
			notifyError(message(error, `Server could not be opened.`))
		} finally {
			onRequestedServerHandled(request.requestId)
		}
	}

	onMount(() => {
		const refreshTimer = window.setInterval(() => {
			if (isActive && !editingServer && !loading && !saving) triggerRefresh()
		}, SERVER_ARCHIVE_REFRESH_MS)
		const countdownTimer = window.setInterval(() => (now = Date.now()), 1000)
		const detailTimer = window.setInterval(() => {
			if (isActive && !document.hidden && editingServer && !selectedPlayer && !saving && !detailLoading) void refreshProfile()
		}, 15000)

		return () => {
			window.clearInterval(refreshTimer)
			window.clearInterval(countdownTimer)
			window.clearInterval(detailTimer)
		}
	})

	$: refreshIn = Math.max(0, Math.ceil((nextRefreshAt - now) / 1000));
	$: if (isActive && !editingServer && !loading && !saving && refreshIn === 0) triggerRefresh();

	function triggerRefresh(): void {
		refreshRevision += 1;
		now = Date.now();
		nextRefreshAt = now + SERVER_ARCHIVE_REFRESH_MS;
	}

	async function saveName(patch: GameServerPatch): Promise<void> {
		if (!editingServer || !editingProfile?.canEditDetails || saving) throw new Error(`Server editing is unavailable.`)
		const id = editingServer.id
		const version = ++editorVersion
		saving = true
		detailLoading = false
		try {
			const updated = await updateServer(id, patch)
			if (version !== editorVersion || editingServer?.id !== id) return
			editingServer = { ...editingServer, ...updated }
			editingProfile = { ...editingProfile, gameServer: { ...editingProfile.gameServer, ...updated } }
			notifySuccess(`Server renamed.`)
			triggerRefresh()
		} finally { if (version === editorVersion) saving = false }
	}

	async function refreshProfile(): Promise<void> {
		if (!editingServer || detailLoading || saving) return
		const id = editingServer.id
		const version = ++editorVersion
		detailLoading = true
		try {
			const profile = await getServer(id)
			if (version !== editorVersion || editingServer?.id !== id) return
			editingProfile = profile
			editingServer = profile.gameServer
			editorError = null
		} catch (error) {
			if (version === editorVersion) editorError = message(error, `Server refresh failed.`)
		} finally { if (version === editorVersion) detailLoading = false }
	}

	async function openEditor(server: GameServerRecord, loadedProfile?: GameServerProfile): Promise<void> {
		const version = ++editorVersion
		renaming = false
		editingServer = server
		editingProfile = null
		editorError = null
		detailLoading = true

		try {
			const profile = loadedProfile ?? await getServer(server.id)
			if (version === editorVersion && editingServer?.id === server.id) {
				editingProfile = profile
				editingServer = profile.gameServer
			}
		} catch (error) {
			if (version === editorVersion) editorError = message(error, `Server request failed.`)
		} finally {
			if (version === editorVersion) detailLoading = false
		}
	}

	function closeEditor(): void {
		renaming = false
		selectedPlayer = null
		editorVersion += 1
		saving = false
		editingServer = null
		editingProfile = null
		editorError = null
		detailLoading = false
	}

	async function requestCloseEditor() {
		if (await unsavedChanges.canLeave()) closeEditor()
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

<section {hidden} class="panel-view servers-view" class:servers-view--player={selectedPlayer !== null} aria-label="Server browser">
	{#if selectedPlayer}
		<PlayerDetailPanel player={selectedPlayer} backLabel="Back to server players" onBack={() => (selectedPlayer = null)} {onOpenServer} />
	{/if}
	{#if !selectedPlayer}
	<PanelHeader title={editingServer ? getServerLabel(editingServer) : `Server browser`} eyebrow={editingServer ? "Server" : `${meta.totalResults} / ${totalServers} servers`} leadingIcon={editingServer ? "fa-arrow-left" : null} leadingLabel="Back to server browser" onLeading={editingServer ? () => void requestCloseEditor() : null}>
		<svelte:fragment slot="title">
			<span class="server-title">{editingServer ? getServerLabel(editingServer) : `Server browser`}</span>
			{#if editingServer && editingProfile?.canEditDetails}
				<IconButton icon="fa-pen" ariaLabel="Rename server" tooltip="Rename server" size="sm" disabled={saving || detailLoading}
					onClick={event => {
						renameButton = event.currentTarget as HTMLButtonElement
						renaming = true
					}} />
			{/if}
		</svelte:fragment>
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
				{detailLoading}
				detailError={editorError}
				{saving}
				active={isActive && !selectedPlayer}
				onSelectPlayer={player => void navigation.visit(() => { selectedPlayer = player })}
				onRetry={() => void refreshProfile()}
			/>
		{/if}
		<ServerArchive hidden={Boolean(editingServer)} active={isActive && !editingServer} {refreshRevision} busy={saving} {requestedYoursRequestId} {onRequestedYoursHandled} onEdit={server => void navigation.visit(() => openEditor(server))} onDelete={remove} onRestore={restore} onResult={(result) => { meta = result.meta; totalServers = result.totalServers; loading = result.loading; if (result.refreshedAt) { now = Date.now(); nextRefreshAt = now + SERVER_ARCHIVE_REFRESH_MS; } }} />
	</div>
</section>

{#if renaming && editingServer && editingProfile?.canEditDetails}
	{#key editingServer.id}
		<ServerNameModal server={editingServer} returnFocus={renameButton} onSave={saveName} onClose={() => { renaming = false }} />
	{/key}
{/if}

<style lang="scss">
	.server-title { min-width: 0; overflow-wrap: anywhere; }
	.servers-view { box-sizing: border-box; height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); padding-top: var(--gutter-lg); }
	.servers-view__body { min-height: 0; display: grid; }
	.servers-view__body[hidden] { display: none; }
	.servers-view--player { grid-template-rows: minmax(0, 1fr); padding-top: 0; }
</style>
