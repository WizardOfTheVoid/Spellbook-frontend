<script lang="ts">
  import type { TeamRecord } from "$lib/core"
  import { getCoreErrorMessage } from "$lib/core"
  import { User } from "$lib/auth/user"
  import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
  import { unwrap } from "$lib/utils/apiResult"
  import { fetchProfileOwners } from "$lib/utils/serverProfilesApi"
  import Button from "$lib/components/ui/Button.svelte"
  import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte"

  type TeamTarget = Pick<TeamRecord, `id` | `name`>

  export let team: TeamTarget
  export let onDeleted: (teamId: number) => void | Promise<void>
  export let showButton = true

  let target: TeamTarget | null = null
  let busy = false
  let returnFocus: HTMLButtonElement | null = null

  export function open(trigger: HTMLButtonElement | null = null): void {
    returnFocus = trigger
    target = { id: team.id, name: team.name }
  }

  async function confirm(): Promise<void> {
    if (!target || busy) return
    const deletedTarget = target
    busy = true
    try {
      const result = await window.chivServer.teams.delete(deletedTarget.id)
      if (result.status === 404) {
        target = null
        notifyError(getCoreErrorMessage(result, `This team is no longer available.`))
        await refresh(deletedTarget.id)
        return
      }

      await unwrap<unknown>(result, `Team delete failed.`)
      target = null
      notifySuccess(`${deletedTarget.name} deleted.`)
      await refresh(deletedTarget.id)
    } catch (error) {
      notifyError(error instanceof Error ? error.message : `Team delete failed.`)
    } finally {
      busy = false
    }
  }

  async function refresh(teamId: number): Promise<void> {
    try {
      const [, owners] = await Promise.all([onDeleted(teamId), fetchProfileOwners()])
      User.Ability.setOwners(owners)
    } catch (error) {
      notifyError(error instanceof Error ? error.message : `Team data refresh failed.`)
    }
  }
</script>

{#if showButton}<Button label="Delete team" icon="fa-trash" variant="danger" onClick={() => open()} />{/if}

{#if target}
  <ConfirmModal
    title={`Delete ${target.name}?`}
    message="This will remove every member, delete the team and its profiles, release their connected game servers, and notify every member. Any Discord connection will be unlinked."
    icon="fa-trash"
    iconType="light"
    confirmLabel="Yes, delete team"
    cancelLabel="No"
    busyLabel="Deleting..."
    {busy}
    {returnFocus}
    manageOverlayState
    onConfirm={() => void confirm()}
    onCancel={() => target = null}
  />
{/if}
