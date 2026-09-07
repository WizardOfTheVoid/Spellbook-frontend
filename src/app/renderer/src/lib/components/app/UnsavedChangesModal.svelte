<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { authState } from '$lib/auth/user'
  import { getOverlayApi } from '$lib/core'
  import { notifyError } from '$lib/notifications/notificationEvents'
  import { ModalStateCoordinator } from '$lib/utils/quickActionUi'
  import type { UnsavedChangesPrompt } from '$lib/utils/unsavedChanges'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'

  export let prompt: UnsavedChangesPrompt

  const modalState = new ModalStateCoordinator(open => getOverlayApi().setModalOpen(open))

  onMount(() => {
    const userId = get(authState).user?.id
    const stopSession = authState.subscribe(state => {
      if (state.user?.id !== userId) prompt.respond(false)
    })
    const stopVisibility = getOverlayApi().onVisibilityChange(visible => {
      if (!visible) prompt.respond(false)
    })
    void syncModal(true)
    return () => {
      stopSession()
      stopVisibility()
      prompt.respond(false)
      void syncModal(false)
    }
  })

  async function syncModal(open: boolean): Promise<void> {
    try {
      await modalState.set(open)
    } catch {
      prompt.respond(false)
      notifyError(`The unsaved changes dialog could not update its overlay state.`)
    }
  }
</script>

<ConfirmModal
  title="Unsaved changes"
  message="You have unsaved profile changes. Discard them and leave this page?"
  confirmLabel="Discard changes"
  cancelLabel="Keep editing"
  icon="fa-triangle-exclamation"
  iconType="light"
  returnFocus={prompt.returnFocus}
  onConfirm={() => prompt.respond(true)}
  onCancel={() => prompt.respond(false)}
/>
