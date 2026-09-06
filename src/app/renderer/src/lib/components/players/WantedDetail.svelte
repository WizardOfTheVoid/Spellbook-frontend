<script lang="ts">
	import { onDestroy } from "svelte"
	import type { PlayerAction } from "$lib/core"
	import { authState } from "$lib/auth/user"
	import type { PlayerState } from "$lib/types/playerState"
	import { getPlayerDisplayName } from "$lib/utils/displayNames"
	import { actionAuthor, actionLabel } from "$lib/utils/playerActions"
	import { formatFullDateTime, formatShortRelativeDateTime } from "$lib/utils/playerUtils"
	import {
		getWantedPlayer,
		removeWantedPlayer,
		revertWantedPlayer,
	} from "$lib/utils/wantedActionsApi"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import Button from "$lib/components/ui/Button.svelte"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import Tag from "$lib/components/ui/Tag.svelte"
	import PlayerDetailPanel from "./PlayerDetailPanel.svelte"
	import WantedAmbient from "./WantedAmbient.svelte"
	import {
		createWantedDetailController,
		type WantedDetailViewState,
	} from "./wantedDetailState"

	export let player: PlayerState
	export let serverExternalId: string | null = null
	export let serverName = "Current game server"
	export let serverAddress: string | null = null
	export let backLabel = "Back to wanted players"
	export let onBack: () => void
	export let onOpenProfile: () => void
	export let onOpenNotes: () => void

	let viewState: WantedDetailViewState = {
		detail: null,
		loading: false,
		inactive: false,
		error: null,
		mutation: null,
	}
	let activeUser = $authState.user
	let sessionRevision = 1
	let contextKey = ""
	let contextGeneration = 0
	const controller = createWantedDetailController({
		load: getWantedPlayer,
		revert: revertWantedPlayer,
		remove: removeWantedPlayer,
		onChange: state => { viewState = state },
	})

	$: if ($authState.user !== activeUser) {
		activeUser = $authState.user
		sessionRevision += 1
		contextKey = ""
	}
	$: nextContextKey = `${player.dbId ?? 0}:${sessionRevision}:${activeUser?.id ?? 0}`
	$: if (nextContextKey !== contextKey) {
		contextKey = nextContextKey
		contextGeneration += 1
		void controller.select(activeUser && player.dbId
			? { playerId: player.dbId, sessionRevision }
			: null)
	}
	$: detail = viewState.detail
	$: noteCount = detail?.noteCount ?? 0
	$: source = detail?.sourceAction ?? null
	$: playerName = getPlayerDisplayName(player.name)
	$: completedByServer = new Map((detail?.automaticActions ?? []).map(action => [action.gameServerId, action]))

	onDestroy(() => controller.destroy())

	async function revert(): Promise<void> {
		if (!source || viewState.mutation || !window.confirm(`Revert the global ban for ${playerName}?`)) return
		const selectedGeneration = contextGeneration
		const result = await controller.revert(source.id)
		if (selectedGeneration !== contextGeneration) return
		if (result.status === `applied`) {
			notifySuccess(`Global ban reverted.`)
		} else if (result.status === `error`) {
			notifyError(result.error)
		}
	}

	async function remove(): Promise<void> {
		if (!detail?.canRemove || viewState.mutation || !window.confirm(`Remove ${playerName} from Wanted?`)) return
		const selectedGeneration = contextGeneration
		const result = await controller.remove()
		if (selectedGeneration !== contextGeneration) return
		if (result.status === `applied`) {
			notifySuccess(`Player removed from Wanted.`)
			onBack()
		} else if (result.status === `error`) {
			notifyError(result.error)
		}
	}

	function displayServer(action: PlayerAction): string {
		return action.gameServer?.displayName?.trim()
			|| action.gameServer?.name?.trim()
			|| (action.gameServerId ? `Server #${action.gameServerId}` : `Community Hivemind`)
	}

	function coverageStatus(action: PlayerAction): string {
		if (!source) return `Unavailable`
		if (source.actionType === `unban`) return completedByServer.has(action.gameServerId) ? `Reverted` : `Pending`
		if (source.actionType === `mock`) return `Reached`
		return action.id === source.id ? `Original ban` : `Reached`
	}
</script>

{#if viewState.inactive}
	<PlayerDetailPanel
		{player}
		{serverExternalId}
		{serverName}
		{serverAddress}
		{backLabel}
		{onBack}
		notice="This player is no longer wanted."
	/>
{:else}
<section class="panel-view panel-view--sub wanted-detail" aria-label="Wanted player detail">
	<WantedAmbient />
	<PanelHeader
		title={playerName}
		eyebrow={player.playfabId}
		leadingIcon="fa-chevron-left"
		leadingLabel={backLabel}
		onLeading={onBack}
	>
		<svelte:fragment slot="trailing">
			<Button label="Open profile" icon="fa-user" onClick={onOpenProfile} />
			{#if player.dbId}<Tag label="Notes" suffix={`(${noteCount})`} icon="fa-note-sticky" onClick={onOpenNotes} />{/if}
		</svelte:fragment>
	</PanelHeader>

	<div class="wanted-detail__body" aria-busy={viewState.loading}>
		{#if !detail && viewState.loading}
			<EmptyState title="Loading wanted player" message="Fetching the current Wanted action and server coverage." />
		{:else if !detail}
			<EmptyState
				title="Wanted detail unavailable"
				message={viewState.error ?? (player.dbId ? "Wanted detail could not be loaded." : "This player has no database ID.")}
			/>
			{#if player.dbId && activeUser}
				<Button label="Retry" icon="fa-rotate-right" onClick={() => void controller.refresh()} />
			{/if}
		{:else}
			{#if viewState.error}
				<div class="wanted-detail__notice" role="alert">
					<span>{viewState.error}</span>
					<Button label="Retry" icon="fa-rotate-right" size="sm" onClick={() => void controller.refresh()} />
				</div>
			{/if}

			<div class="wanted-detail__actions">
				{#if detail.canRevert && source?.actionType === `ban`}
					<Button label={viewState.mutation === `revert` ? "Reverting..." : "Revert global ban"} icon="fa-rotate-left" disabled={viewState.mutation !== null} onClick={() => void revert()} />
				{/if}
				{#if detail.canRemove}
					<Button label={viewState.mutation === `remove` ? "Removing..." : "Remove player"} icon="fa-user-minus" variant="danger" disabled={viewState.mutation !== null} onClick={() => void remove()} />
				{/if}
			</div>

			<div class="wanted-detail__grid">
				<article class="wanted-detail__card">
					<h2>Current source</h2>
					{#if source}
						<dl>
							<div><dt>Action</dt><dd>{actionLabel(source)}</dd></div>
							<div><dt>Reason</dt><dd>{source.reason?.trim() || "No reason recorded."}</dd></div>
							<div><dt>Author</dt><dd>{actionAuthor(source)}</dd></div>
							<div><dt>Origin</dt><dd>{displayServer(source)}</dd></div>
							<div><dt>Created</dt><dd title={formatFullDateTime(source.createdAt)}>{formatShortRelativeDateTime(source.createdAt)}</dd></div>
						</dl>
					{:else}
						<p>Legacy Wanted row. Source details and coverage are unavailable.</p>
					{/if}
				</article>

				<article class="wanted-detail__card">
					<h2>Player</h2>
					<dl>
						<div><dt>PlayFab ID</dt><dd>{detail.player.playfabId}</dd></div>
						<div><dt>Database ID</dt><dd>#{detail.player.id}</dd></div>
						<div><dt>Status</dt><dd>{detail.player.isOnline ? "Online" : "Offline"}</dd></div>
						<div><dt>Last seen</dt><dd>{detail.player.lastSeen ? formatFullDateTime(detail.player.lastSeen) : "Unavailable"}</dd></div>
					</dl>
				</article>
			</div>

			<article class="wanted-detail__card">
				<h2>Game Servers</h2>
				<div class="wanted-detail__coverage">
					{#each detail.targetActions as action (action.id)}
						<div class="wanted-detail__coverage-row">
							<div>
								<strong>{displayServer(action)}</strong>
								<small>{coverageStatus(action)} · {actionLabel(action)}</small>
							</div>
						</div>
					{:else}
						<p>{source?.actionType === `mock` ? "No server has executed this mock yet." : "Coverage is unavailable."}</p>
					{/each}
				</div>
			</article>

			<article class="wanted-detail__card">
				<h2>Current automatic executions</h2>
				<div class="wanted-detail__coverage">
					{#each detail.automaticActions as action (action.id)}
						<div class="wanted-detail__coverage-row">
							<div><strong>{displayServer(action)}</strong><small>{actionLabel(action)} · {formatFullDateTime(action.createdAt)}</small></div>
						</div>
					{:else}
						<p>No automatic execution has completed for the current source.</p>
					{/each}
				</div>
			</article>
		{/if}
	</div>
</section>
{/if}

<style lang="scss">
	.wanted-detail {
		position: relative;
		box-sizing: border-box;
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding-top: var(--gutter-lg);
	}
	.wanted-detail > :global(*) { position: relative; z-index: 1; }
	.wanted-detail > :global(.wanted-ambient) { position: absolute; z-index: 0; }

	.wanted-detail__body {
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}

	.wanted-detail__actions,
	.wanted-detail__notice,
	.wanted-detail__coverage-row {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
	}

	.wanted-detail__notice,
	.wanted-detail__coverage-row {
		justify-content: space-between;
	}

	.wanted-detail__notice,
	.wanted-detail__card {
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		background: rgba(3, 12, 18, 0.36);
	}

	.wanted-detail__grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--gutter-md);
	}

	.wanted-detail__card,
	.wanted-detail__coverage,
	.wanted-detail__coverage-row > div {
		display: grid;
		gap: var(--gutter-sm);
	}

	.wanted-detail__card h2,
	.wanted-detail__card p,
	.wanted-detail__card dl {
		margin: 0;
	}

	.wanted-detail__card h2 {
		font-size: var(--font-size-lg);
	}

	.wanted-detail__card dl {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--gutter-md);
	}

	.wanted-detail__card dt,
	.wanted-detail__coverage-row small {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}

	.wanted-detail__card dd {
		margin: var(--gutter-sm) 0 0;
		overflow-wrap: anywhere;
	}

	.wanted-detail__coverage-row {
		border-top: 1px solid var(--color-dark-secondary);
		padding-top: var(--gutter-sm);
	}

	@media (max-width: 860px) {
		.wanted-detail__grid { grid-template-columns: 1fr; }
	}
</style>
