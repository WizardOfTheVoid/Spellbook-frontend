<script lang="ts">
	import { onMount } from 'svelte'
	import type { GameServerPlayers } from '$lib/core'
	import type { PlayerState } from '$lib/types/playerState'
	import { getGameServerPlayers } from '$lib/utils/gameServersApi'
	import { createDbPlayerState } from '$lib/utils/playerStateData'
	import { createLatestRequestTracker } from '$lib/utils/archiveRequests'
	import { formatFullDateTime, formatShortRelativeDateTime } from '$lib/utils/playerUtils'
	import PlayerRow from '$lib/components/players/PlayerRow.svelte'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import IconButton from '$lib/components/ui/IconButton.svelte'

	export let gameServerId: number
	export let active = true
	export let onSelect: (player: PlayerState) => void

	let data: GameServerPlayers | null = null
	let loading = false
	let error: string | null = null
	let now = new Date()
	const requests = createLatestRequestTracker(pending => (loading = pending))

	$: players = data?.players.map(createDbPlayerState) ?? []
	$: stale = data?.a2s.status === `stale`
		|| Boolean(data?.a2s.observedAt && now.getTime() - Date.parse(data.a2s.observedAt) > 60_000)

	onMount(() => {
		void refresh()
		const timer = window.setInterval(() => {
			now = new Date()
			if (active) void refresh()
		}, 15_000)
		return () => {
			window.clearInterval(timer)
			requests.cancel()
		}
	})

	async function refresh(): Promise<void> {
		if (loading) return
		const request = requests.start()
		try {
			const result = await getGameServerPlayers(gameServerId)
			if (!requests.isCurrent(request)) return
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
	<div class="server-players__toolbar">
		<small>
			{#if data?.a2s.observedAt}
				{stale ? `Last known players · ` : ``}<time datetime={data.a2s.observedAt} title={formatFullDateTime(data.a2s.observedAt)}>Updated {formatShortRelativeDateTime(data.a2s.observedAt, now)}</time>
			{:else}
				Players
			{/if}
		</small>
		<IconButton icon="fa-rotate" ariaLabel="Refresh server players" disabled={loading} onClick={() => void refresh()} />
	</div>

	{#if error}
		<EmptyState title="Players unavailable" message={error} />
	{:else if loading && !data}
		<p role="status">Loading players...</p>
	{:else if !data || data.a2s.status === `unavailable`}
		<EmptyState title="Players unavailable" message="Player data isn’t available for this server yet." />
	{:else}
		<small>Player identities are matched by nickname.</small>
		<div class="server-players__list">
			{#each players as player (player.dbId)}
				<PlayerRow {player} mode="database" {onSelect} />
			{:else}
				<EmptyState title="No matched players" message="No matched player records are available for this observation." />
			{/each}
		</div>
	{/if}
</section>

<style lang="scss">
	.server-players,
	.server-players__list {
		display: grid;
		align-content: start;
		gap: var(--gutter-sm);
	}

	.server-players__toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	small {
		color: var(--color-text-secondary);
	}
</style>
