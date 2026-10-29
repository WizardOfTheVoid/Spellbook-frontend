<script lang="ts">
	import { onMount } from 'svelte'
	import type { GameServerPlayers } from '$lib/core'
	import type { PlayerState } from '$lib/types/playerState'
	import { getGameServerPlayers } from '$lib/utils/gameServersApi'
	import { serverStorePlayers } from '$lib/serverStore/serverStorePlayers'
	import { serverStore } from '$lib/serverStore/serverStore'
	import { createLatestRequestTracker } from '$lib/utils/archiveRequests'
	import { formatFullDateTime, formatShortRelativeDateTime } from '$lib/utils/playerUtils'
	import PlayerRow from '$lib/components/players/PlayerRow.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import IconButton from '$lib/components/ui/IconButton.svelte'
	import PanelHeader from '$lib/components/ui/PanelHeader.svelte'

	export let gameServerId: number
	export let active = true
	export let onSelect: (player: PlayerState) => void

	let data: GameServerPlayers | null = null
	let loading = false
	let error: string | null = null
	let now = new Date()
	let mounted = false
	let selection = ``
	const requests = createLatestRequestTracker(pending => (loading = pending))

	$: players = data ? serverStorePlayers(data) : []
	$: stale = data?.roster.status === `stale`
	$: observedAt = data?.roster.source ? data.roster.sources[data.roster.source].observedAt : null
	$: if (mounted && selection !== `${gameServerId}:${active}`) {
		selection = `${gameServerId}:${active}`
		requests.cancel()
		data = null
		error = null
		if (active) void refresh()
	}

	onMount(() => {
		mounted = true
		const unsubscribe = serverStore.subscribe((id, next) => {
			if (id === null || id === gameServerId) data = next
		})
		const timer = window.setInterval(() => {
			now = new Date()
			if (active) void refresh()
		}, 15_000)
		return () => {
			mounted = false
			window.clearInterval(timer)
			requests.cancel()
			unsubscribe()
		}
	})

	async function refresh(): Promise<void> {
		if (loading) return
		const request = requests.start()
		const requestedId = gameServerId
		try {
			const result = await getGameServerPlayers(requestedId)
			if (requestedId !== gameServerId || !active || !requests.isCurrent(request)) return
			data = result
			error = null
			now = new Date()
		} catch (reason) {
			if (!requests.isCurrent(request)) return
			data = null
			error = reason instanceof Error ? reason.message : `Server players request failed.`
		} finally {
			requests.settle(request)
		}
	}
</script>

<section class="server-players" aria-label="Server players" aria-busy={loading}>
	<PanelHeader variant="section" title="Players">
		<svelte:fragment slot="subtitle">
		<small>
			{#if observedAt}
				{stale ? `Last known players · ` : ``}<time datetime={observedAt} title={formatFullDateTime(observedAt)}>Updated {formatShortRelativeDateTime(observedAt, now)}</time>
			{:else}
				Players
			{/if}
		</small>
		</svelte:fragment>
		<svelte:fragment slot="trailing">
		<IconButton icon="fa-rotate" ariaLabel="Refresh server players" disabled={loading} onClick={() => void refresh()} />
		</svelte:fragment>
	</PanelHeader>

	{#if error}
		<EmptyState title="Players unavailable" message={error} />
	{:else if loading && !data}
		<p role="status">Loading players...</p>
	{:else if !data || data.roster.status === `unavailable`}
		<EmptyState title="Players unavailable" message="Player data isn’t available for this server yet." />
	{:else}
		<div class="server-players__list">
			{#each players as player (player.liveKey)}
				<PlayerRow {player} {gameServerId} mode="database" {onSelect} />
			{:else}
				<EmptyState title="No players" message="This observation contains no players." />
			{/each}
		</div>
	{/if}
</section>

<style lang="scss">
	.server-players,
	.server-players__list {
		display: grid;
		align-content: start;
		gap: var(--gutter-md);
	}

	.server-players { gap: var(--gutter-lg); min-width: 0; }

	small {
		color: var(--color-text-secondary);
	}
</style>
