<script lang="ts">
  import Avatar from '$lib/components/ui/avatar.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import { playerLabel } from '../preview/telemetrySelectors'
  import type { TelemetryPlayer } from '../session/telemetryModels'
  import { playerObservationLabel } from './playerPresentation'
  export let player: TelemetryPlayer | null
  export let selectedPlayerId: string | null
  export let playerCount: number
</script>

<div class="identity">
  <Avatar name={player ? playerLabel(player) : selectedPlayerId ? `Unobserved player` : `All players`} size="md" />
  <div class="identity-copy">
    <strong>{player ? playerLabel(player) : selectedPlayerId ? `Not observed at this time` : `All players`}</strong>
    <span>{player ? player.playFabId ? `PlayFab · ${player.playFabId}` : `Anonymous track · ${player.id}`
      : selectedPlayerId ? `Seek forward to see this player's first observation` : `${playerCount} tracks · Recording history`}</span>
  </div>
  {#if player}<Tag compact label={playerObservationLabel(player)} />{/if}
</div>

<style>
  .identity { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .identity-copy { min-width: 0; flex: 1; display: grid; gap: 4px; }
  strong { font-size: var(--font-size-lg); font-weight: var(--font-weight-medium); }
  span { font-size: var(--font-size-xs); color: var(--color-light-tertiary); overflow-wrap: anywhere; }
  @container telemetry (max-width: 479px) {
    .identity { flex-wrap: wrap; }
  }
</style>
