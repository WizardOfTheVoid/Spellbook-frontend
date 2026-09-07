<script lang="ts">
  import type { PlayerPresence } from '@spellbook/shared/playerPresence.js'
  import { authState } from '$lib/auth/user'
  import { playerPresenceTooltip } from '$lib/utils/playerPresenceTooltip'
  import PlayerOnlineIndicator from './PlayerOnlineIndicator.svelte'

  export let name: string
  export let isOnline: boolean
  export let presence: PlayerPresence | null | undefined = null
</script>

<span class="player-presence-name" use:playerPresenceTooltip={{
  presence: isOnline ? presence ?? null : null,
  viewer: $authState.user
}}>
  {name}
  {#if isOnline}<PlayerOnlineIndicator tooltipOnParent />{/if}
</span>

<style>
  .player-presence-name { display: inline-flex; align-items: center; gap: var(--gutter-sm); }
</style>
