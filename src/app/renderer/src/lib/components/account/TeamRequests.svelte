<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { getServerApi, type TeamJoinRequest } from '$lib/core'
  import type { TeamOutgoingInvitation, TeamInvitationCancellation } from '@spellbook/shared/notifications'
  import { authState } from '$lib/auth/user'
  import { unwrap } from '$lib/utils/apiResult'
  import { pendingTeamRequests } from '$lib/stores/pendingTeamRequests'
  import { currentTeamState } from '$lib/teams/currentTeamStore'
  import IconButton from '../ui/IconButton.svelte'
  import PanelHeader from '../ui/PanelHeader.svelte'
  import TeamJoinRequests from './TeamJoinRequests.svelte'
  import OutgoingTeamInvitations from './teams/outgoingTeamInvitations.svelte'
  import { TeamRequestsController } from './teams/teamRequestsController'
  export let teamId: number
  export let active = true
  export let onChanged: () => Promise<void>
  export let onHeaderActions: (actions: Snippet | null) => void = () => {}
  const controller = new TeamRequestsController({
    requests: async id => unwrap<TeamJoinRequest[]>(await getServerApi().teams.requests(id), `Join requests could not be loaded.`),
    invitations: async id => unwrap<TeamOutgoingInvitation[]>(await getServerApi().teams.invitations(id), `Invitations could not be loaded.`),
    decide: async (id, userId, decision) => { await unwrap(await getServerApi().teams.decideRequest(id, userId, decision), `The request could not be updated.`) },
    cancel: async (id, invitationId) => unwrap<TeamInvitationCancellation>(await getServerApi().teams.cancelInvitation(id, invitationId), `The invitation could not be cancelled.`),
    onChanged: async () => { await onChanged()
      void pendingTeamRequests.refresh() },
    onIncomingCount: (id, count, accountId) => { currentTeamState.updateRequestCount(id, count, accountId) },
    scheduler: { setInterval: (run, milliseconds) => window.setInterval(run, milliseconds), clearInterval: id => window.clearInterval(id) }
  }, value => { state = value })
  let state = controller.state
  $: { controller.setContext($authState.user?.id ?? null, teamId, active)
    if (active) void controller.refresh() }
  $: busyUserIds = state.busyKeys.filter(key => key.startsWith(`request:`)).map(key => Number(key.split(`:`)[1]))
  $: busyInvitationIds = state.busyKeys.filter(key => key.startsWith(`invitation:`)).map(key => Number(key.split(`:`)[1]))
  onMount(() => { onHeaderActions(actions)
    return () => onHeaderActions(null) })
  onDestroy(() => controller.destroy())
</script>

{#snippet actions()}<IconButton icon="fa-rotate" ariaLabel="Refresh join requests" tooltip="Refresh join requests" disabled={state.initialLoading || state.refreshing} onClick={() => void controller.refresh()} />{/snippet}

<div class="team-requests">
  {#if state.error}<p role="alert">{state.error}</p>{/if}
  {#if state.mutationError}<p role="alert">{state.mutationError}</p>{/if}
  {#if state.notice}<p role="status">{state.notice}</p>{/if}
  {#if state.initialLoading}<p role="status">Loading join requests...</p>
  {:else if state.hydrated}
    <section class="team-requests__incoming"><PanelHeader title="Requests to join" variant="section" />
      <TeamJoinRequests requests={state.incoming} {busyUserIds} onDecide={(userId, decision) => void controller.decide(userId, decision)} />
    </section>
    <OutgoingTeamInvitations invitations={state.outgoing} busyIds={busyInvitationIds} onCancel={id => void controller.cancel(id)} />
  {/if}
</div>

<style lang="scss">
  .team-requests { display: grid; gap: var(--gutter-lg); }
  .team-requests__incoming { display: grid; gap: var(--gutter-md); }
  p { margin: 0; color: var(--color-light-secondary); font-size: var(--font-size-sm); }
</style>
