<script lang="ts">
  import type { TeamMemberRecord } from '$lib/core'
  import Button from '../ui/Button.svelte'
  import InviteMemberModal from './teams/inviteMemberModal.svelte'
  export let users: TeamMemberRecord[] = []
  export let disabled = false
  export let loading = false
  export let onOpen: () => Promise<void>
  export let onAdd: (user: TeamMemberRecord, force?: boolean) => Promise<void>
  export let allowForce = false
  let open = false
  let returnFocus: HTMLButtonElement | null = null
  function show(): void {
    returnFocus = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    open = true
  }
</script>
<Button icon="fa-plus" label="Invite member" {disabled} onClick={show} />
{#if open}<InviteMemberModal {users} {loading} {returnFocus} {allowForce} onLoad={onOpen} {onAdd} onClose={() => { open = false }} />{/if}
