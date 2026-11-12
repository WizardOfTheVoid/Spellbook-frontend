<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { GameServerPatch, GameServerRecord } from '$lib/core'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import { getServerLabel } from '$lib/utils/displayNames'

  export let server: GameServerRecord
  export let returnFocus: HTMLButtonElement | null = null
  export let onSave: (patch: GameServerPatch) => Promise<void>
  export let onClose: () => void

  const initialName = getServerLabel(server)
  const initialDisplayName = server.displayName?.trim() || null
  let name = initialName
  let busy = false
  let error = ``
  let disposed = false
  $: displayName = name.trim() || null
  $: valid = name.trim() !== initialName && name.trim().length <= 255 && (displayName !== null || initialDisplayName !== null)
  onDestroy(() => { disposed = true })

  async function save() {
    if (busy || !valid) return
    busy = true
    error = ``
    try {
      await onSave({ displayName })
      if (!disposed) onClose()
    } catch (value) {
      if (!disposed) error = value instanceof Error ? value.message : `Could not rename the server.`
    } finally {
      if (!disposed) busy = false
    }
  }
</script>

<ConfirmModal
  title="Rename server"
  message="Choose the name shown in SpellBook."
  icon="fa-pen"
  iconType="light"
  confirmLabel="Save name"
  confirmTone="primary"
  cancelLabel="Cancel"
  busyLabel="Saving..."
  confirmDisabled={!valid}
  {busy}
  {returnFocus}
  manageOverlayState
  onConfirm={() => void save()}
  onCancel={onClose}
>
  <form on:submit|preventDefault={() => void save()}>
    <Input label="Server name" value={name} placeholder={server.name} maxlength={255} disabled={busy}
      hint="Leave empty to use the name reported by the game server." onChange={value => { name = value }} />
  </form>
  {#if error}<p role="alert">{error}</p>{/if}
</ConfirmModal>
