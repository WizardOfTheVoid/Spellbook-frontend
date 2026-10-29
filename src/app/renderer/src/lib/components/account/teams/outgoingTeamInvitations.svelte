<script lang="ts">
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import type { TeamOutgoingInvitation } from '@spellbook/shared/notifications'
  import { formatFullDateTime } from '$lib/utils/playerUtils'
  import ListRow from '../../ui/ListRow.svelte'
  import Button from '../../ui/Button.svelte'
  import PanelHeader from '../../ui/PanelHeader.svelte'
  export let invitations: TeamOutgoingInvitation[]
  export let busyIds: number[] = []
  export let onCancel: (invitationId: number) => void
</script>

<section class="outgoing-team-invitations">
  <PanelHeader title="Invitations" variant="section" />
  {#each invitations as invitation (`invitation:${invitation.id}`)}
    <ListRow title={getAdminName(invitation)} subtitle={`@${invitation.username} · ${formatFullDateTime(invitation.createdAt)}`}>
      <svelte:fragment slot="meta"><small>Awaiting answer</small></svelte:fragment>
      <svelte:fragment slot="trailing"><Button label="Cancel invitation" disabled={busyIds.includes(invitation.id)} onClick={() => onCancel(invitation.id)} /></svelte:fragment>
    </ListRow>
  {:else}<p>No outgoing invitations.</p>{/each}
</section>

<style lang="scss">
  .outgoing-team-invitations { display: grid; gap: var(--gutter-md); }
  small, p { color: var(--color-light-tertiary); font-size: var(--font-size-sm); }
</style>
