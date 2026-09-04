<script lang="ts">
	import type { PlayerState } from "$lib/types/playerState"
	import type { PlayerArchiveResult, PlayerArchiveSession } from "$lib/utils/playerArchive"
	import { authState } from "$lib/auth/user"
	import { formatTime } from "$lib/utils/playerUtils"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import { createWantedPlayer } from "$lib/utils/wantedActionsApi"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import PlayerArchive from "./PlayerArchive.svelte"
	import WantedAddModal from "./WantedAddModal.svelte"
	import WantedAmbient from "./WantedAmbient.svelte"

	export let isActive = false
	export let onSelectPlayer: (player: PlayerState) => void
	export let onOpenPlayerProfile: (player: PlayerState) => void
	export let session: PlayerArchiveSession | null = null

	let refreshRevision = 0
	let loading = false
	let currentPage = 1
	let totalPages = 0
	let lastRefresh = "--:--:--"
	let adding = false
	let addBusy = false
	let addError: string | null = null

	function handleResult(result: PlayerArchiveResult): void {
		loading = result.state === "loading"
		currentPage = result.meta.currentPage
		totalPages = result.meta.totalPages
		if (result.refreshedAt) lastRefresh = formatTime(new Date(result.refreshedAt))
	}

	async function add(playfabId: string, mock: boolean): Promise<void> {
		if (!playfabId || addBusy) return
		addBusy = true
		addError = null
		try {
			await createWantedPlayer({ playfabId, mock })
			adding = false
			refreshRevision += 1
			notifySuccess(mock ? `Mock Wanted player added.` : `Player sent to the Community Hivemind.`)
		} catch (error) {
			addError = error instanceof Error ? error.message : `Wanted player could not be added.`
			notifyError(addError)
		} finally {
			addBusy = false
		}
	}
</script>

<section
	class="panel-view player-list"
	class:player-list--permission-warning={$authState.user && !$authState.user.wantedCreationEnabled}
	aria-label="Wanted players"
>
	<WantedAmbient />
	<PanelHeader title="Wanted" eyebrow="Community Hivemind">
		<svelte:fragment slot="trailing">
			{#if $authState.user?.wantedCreationEnabled}
				<IconButton icon="fa-plus" ariaLabel="Add wanted player" tooltip="Add wanted player" onClick={() => (adding = true)} />
			{:else}
				<IconButton icon="fa-rotate" ariaLabel="Refresh wanted players" tooltip="Refresh wanted players" disabled={loading} onClick={() => (refreshRevision += 1)} />
			{/if}
			<span>{currentPage} / {Math.max(1, totalPages)}</span>
			<time>{lastRefresh}</time>
		</svelte:fragment>
	</PanelHeader>

	{#if $authState.user && !$authState.user.wantedCreationEnabled}
		<div class="wanted-permission-banner" role="status">
			<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>
			<span>Wanted creation is disabled for your account. You can still view Wanted players and help autoban existing entries, but new hacker bans are stored as permanent local bans.</span>
		</div>
	{/if}

	<PlayerArchive
		active={isActive}
		source="wanted"
		{refreshRevision}
		onSelect={onSelectPlayer}
		onOpenProfile={onOpenPlayerProfile}
		onResult={handleResult}
		onWantedMutated={() => (refreshRevision += 1)}
		{session}
	/>
	{#if adding}
		<WantedAddModal
			isSuperadmin={Boolean($authState.user?.isSuperadmin)}
			busy={addBusy}
			error={addError}
			onAdd={(playfabId, mock) => void add(playfabId, mock)}
			onCancel={() => { if (!addBusy) adding = false }}
		/>
	{/if}
</section>

<style lang="scss">
	.player-list {
		position: relative;
		box-sizing: border-box;
		padding-top: var(--gutter-lg);
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		align-content: start;
		gap: var(--gutter-lg);
	}
	.player-list > :global(*) { position: relative; z-index: 1; }
	.player-list > :global(.wanted-ambient) { position: absolute; z-index: 0; }
	.player-list--permission-warning { grid-template-rows: auto auto minmax(0, 1fr); }
	.wanted-permission-banner {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		align-items: start;
		gap: var(--gutter-md);
		margin: 0 var(--gutter-lg);
		border: 1px solid var(--color-accent-tertiary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		color: var(--color-light-secondary);
		background: rgbaa(var(--color-accent-tertiary), 0.08);
		font-size: var(--font-size-xs);
		line-height: 1.5;
	}
	.wanted-permission-banner i { color: var(--color-accent-tertiary); }
</style>
