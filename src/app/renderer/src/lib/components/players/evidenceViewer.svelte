<script lang="ts">
  import { onMount } from 'svelte'
  import { getOverlayApi, type EvidenceComment, type EvidenceDuplicate, type EvidenceItem, type PlayerNotePlayerReference } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import { deleteEvidence, getEvidence, recordEvidenceView } from '$lib/utils/evidenceApi'
  import { containModalTab, mountModalEnvironment, ModalStateCoordinator } from '$lib/utils/quickActionUi'
  import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
  import { closeInfinityMenu, infinityMenuState, openInfinityMenu, type InfinityMenuItem } from '$lib/components/ui/infinityMenu'
  import { requestOpenPlayerReference } from './evidence/navigation'
  import { canDeleteEvidence, mergeEvidenceRefresh } from './evidence/evidenceViewerState'
  import { createEvidenceViewSession } from './evidence/evidenceViewSession'
  import Button from '$lib/components/ui/Button.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import EvidenceDuplicateNotice from './evidenceDuplicateNotice.svelte'
  import EvidenceComments from './evidence/evidenceComments.svelte'
  import EvidenceVideo from './evidence/evidenceVideo.svelte'
  import EvidenceOffenses from './evidence/evidenceOffenses.svelte'
  import EvidenceTags from './evidence/evidenceTags.svelte'

  export let evidence: EvidenceItem
  export let items: EvidenceItem[] = [evidence]
  export let onClose: () => void
  export let onDeleted: (evidenceId: number) => void = () => undefined
  export let onUpdated: (item: EvidenceItem) => void = () => undefined
  let currentEvidence = evidence
  let viewSession = createViewSession(evidence)
  let offensesControl: EvidenceOffenses | undefined
  let videoControl: EvidenceVideo | undefined
  let commentsControl: EvidenceComments | undefined
  let comments: EvidenceComment[] = []
  let positionMs = 0
  let selectedCommentId: number | null = null
  let modalRoot: HTMLDivElement
  let closeButton: HTMLButtonElement | undefined
  let shareButton: HTMLButtonElement | undefined
  let shareMenuRoot: HTMLDivElement
  let shareOpen = false
  let duplicateCount = evidence.duplicateCount
  let duplicates: EvidenceDuplicate[] = evidence.duplicates
  let confirmDelete = false
  let deleteTarget: EvidenceItem | null = null
  let deleting = false
  let disposed = false
  let selectionRevision = 0
  let offenseRevision = 0
  let commentRevision = 0
  const itemUpdates = new Map<number, Pick<EvidenceItem, `offenseIds` | `viewCount` | `commentCount`>>()
  const menusId = `evidence-viewer-menus-${evidence.id}`
  const modalState = new ModalStateCoordinator(open => getOverlayApi().setModalOpen(open))

  $: itemIndex = items.findIndex(item => item.id === currentEvidence.id)
  $: shareItems = [
    { name: `Link to evidence in SpellBook`, icon: `fa-link`, action: () => copy(currentEvidence.evidenceUrl) },
    { name: currentEvidence.file.kind === `video` ? `Link video embed` : `Link image embed`, icon: currentEvidence.file.kind === `video` ? `fa-film` : `fa-image`, action: () => copy(currentEvidence.embedUrl) },
    { name: currentEvidence.isWanted ? `Link wanted profile` : `Link player profile`, icon: `fa-user`, action: () => copy(currentEvidence.isWanted ? currentEvidence.wantedUrl : currentEvidence.playerUrl) }
  ] satisfies InfinityMenuItem[]

  onMount(() => {
    closeInfinityMenu()
    const returnFocus = document.activeElement instanceof HTMLButtonElement ? document.activeElement : null
    const cleanup = mountModalEnvironment(modalRoot, returnFocus)
    const stopMenu = infinityMenuState.subscribe(snapshot => {
      const owned = snapshot?.container === shareMenuRoot
      if (shareOpen && !owned && !disposed) shareButton?.focus()
      shareOpen = owned
    })
    window.addEventListener(`keydown`, keydown, true)
    const stopVisibility = getOverlayApi().onVisibilityChange(visible => { if (!visible) onClose() })
    void syncModal(true)
    closeButton?.focus()
    void loadDuplicates()
    return () => {
      disposed = true
      viewSession.dispose()
      if (shareOpen) closeInfinityMenu()
      stopMenu()
      window.removeEventListener(`keydown`, keydown, true)
      stopVisibility()
      cleanup()
      void syncModal(false)
    }
  })

  async function syncModal(open: boolean): Promise<void> {
    try { await modalState.set(open) }
    catch { notifyError(`Could not update the evidence dialog state.`) }
  }

  function keydown(event: KeyboardEvent): void {
    if (confirmDelete || event.defaultPrevented) return
    if (shareOpen) {
      if (event.key === `Escape`) {
        event.preventDefault()
        event.stopImmediatePropagation()
        closeInfinityMenu()
      } else if (event.key === `Tab`) containModalTab(event, shareMenuRoot, document.activeElement)
      return
    }
    const mediaMenu = modalRoot.querySelector<HTMLElement>(`.vds-menu-items[data-root][aria-hidden="false"]`)
    if (event.key === `Escape` && offensesControl?.dismissDropdown()) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    if (mediaMenu && event.key === `Escape`) {
      event.preventDefault()
      event.stopImmediatePropagation()
      Array.from(modalRoot.querySelectorAll(`media-menu`)).find(menu => menu.contentElement === mediaMenu)?.close(event)
      return
    }
    if (event.key === `Escape`) {
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    } else if (event.key === `Tab`) containModalTab(event, modalRoot, document.activeElement)
  }

  function share(event: MouseEvent): void {
    if (shareOpen) {
      closeInfinityMenu()
      return
    }
    openInfinityMenu({ name: `Share evidence`, icon: `fa-link`, placement: `bottom`, items: shareItems }, { x: event.clientX, y: event.clientY }, shareButton ?? null, undefined, shareMenuRoot)
  }

  function selectEvidence(next: EvidenceItem): void {
    selectionRevision += 1
    offenseRevision = 0
    commentRevision = 0
    viewSession.dispose()
    comments = []
    positionMs = 0
    selectedCommentId = null
    if (shareOpen) closeInfinityMenu()
    currentEvidence = { ...next, ...itemUpdates.get(next.id) }
    viewSession = createViewSession(currentEvidence)
    duplicateCount = next.duplicateCount
    duplicates = next.duplicates
    void loadDuplicates()
  }

  function selectComment(id: number): void {
    selectedCommentId = id
    void commentsControl?.focusComment(id)
  }

  function seekToComment(time: number, id: number): void {
    videoControl?.seek(time)
    selectComment(id)
  }

  const updateComments = (next: EvidenceComment[], countDelta: number) => {
    comments = next
    if (countDelta) {
      commentRevision += 1
      currentEvidence = { ...currentEvidence, commentCount: Math.max(0, (currentEvidence.commentCount ?? next.length - countDelta) + countDelta) }
      publishUpdate()
    }
    if (selectedCommentId !== null && !next.some(comment => comment.id === selectedCommentId)) selectedCommentId = null
  }
  const updateTime = (time: number) => { positionMs = time }
  const getVideoPosition = () => Math.min(videoControl?.getPositionMs() ?? 0, currentEvidence.file.durationMs ?? 60000)

  async function loadDuplicates(): Promise<void> {
    const id = currentEvidence.id
    const revision = selectionRevision
    const offenses = offenseRevision
    const commentChanges = commentRevision
    try {
      const current = await getEvidence(id)
      if (!disposed && currentEvidence.id === id && revision === selectionRevision) {
        currentEvidence = mergeEvidenceRefresh(currentEvidence, current, offenses !== offenseRevision, commentChanges !== commentRevision)
        viewSession.syncCount(currentEvidence.viewCount)
        duplicateCount = current.duplicateCount
        duplicates = current.duplicates
        publishUpdate()
      }
    } catch (error) { if (!disposed && revision === selectionRevision) notifyError(error instanceof Error ? error.message : `Matching evidence could not be loaded.`) }
  }

  async function openMatching(id: number): Promise<void> {
    const revision = ++selectionRevision
    try {
      const next = await getEvidence(id)
      if (disposed || revision !== selectionRevision) return
      selectEvidence(next)
    } catch (error) { if (!disposed && revision === selectionRevision) notifyError(error instanceof Error ? error.message : `Evidence could not be opened.`) }
  }

  function createViewSession(item: EvidenceItem) {
    return createEvidenceViewSession(item, {
      record: recordEvidenceView,
      onRecorded: viewCount => {
        currentEvidence = { ...currentEvidence, viewCount }
        publishUpdate()
      }
    })
  }

  function saveOffenses(offenseIds: number[]): void {
    offenseRevision += 1
    currentEvidence = { ...currentEvidence, offenseIds }
    publishUpdate()
  }

  function publishUpdate(): void {
    itemUpdates.set(currentEvidence.id, { offenseIds: currentEvidence.offenseIds, viewCount: currentEvidence.viewCount, commentCount: currentEvidence.commentCount })
    onUpdated(currentEvidence)
  }

  async function removeEvidence(): Promise<void> {
    if (deleting || !deleteTarget || !canDeleteEvidence($authState.user)) return
    const id = deleteTarget.id
    deleting = true
    try {
      await deleteEvidence(id)
      if (disposed) return
      notifySuccess(`Evidence deleted.`)
      onDeleted(id)
      onClose()
    } catch (error) { if (!disposed) notifyError(error instanceof Error ? error.message : `Evidence could not be deleted.`) }
    finally { if (!disposed) { deleting = false; confirmDelete = false } }
  }

  function prepareDeletion(): void {
    selectionRevision += 1
    deleteTarget = currentEvidence
    confirmDelete = true
  }

  function openPlayer(player: PlayerNotePlayerReference): void {
    onClose()
    requestOpenPlayerReference(player)
  }

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url)
      notifySuccess(`Link copied.`)
    } catch { notifyError(`Link could not be copied.`) }
  }
</script>

<div class="evidence-viewer" bind:this={modalRoot}>
  <button class="evidence-viewer__backdrop" type="button" tabindex="-1" aria-label="Close evidence" on:click={onClose}></button>
  <div class="evidence-viewer__dialog" role="dialog" aria-modal="true" aria-label="Evidence viewer" tabindex="-1">
    <header>
      <div class="evidence-viewer__heading">
        <strong>Cheating evidence</strong>
        <div class="evidence-viewer__metadata"><small>{currentEvidence.nickname || `No nickname listed`}</small>{#if currentEvidence.file.kind === `video`}<small class="evidence-viewer__views"><Icon name="fa-eye" size="sm" />{$viewSession.viewCount} {$viewSession.viewCount === 1 ? `view` : `views`}</small>{/if}</div>
        <EvidenceTags subtypes={currentEvidence.subtypes} />
      </div>
      {#if items.length > 1}
        <nav class="evidence-viewer__navigation" aria-label="Evidence items">
          {#if itemIndex < 0}
            <IconButton icon="fa-arrow-left" ariaLabel="Back to submitted evidence" tooltip="Back to submitted evidence" size="sm" onClick={() => selectEvidence(items[0])} />
            <small>Related evidence</small>
          {:else}
            <IconButton icon="fa-chevron-left" ariaLabel="Previous evidence" tooltip="Previous evidence" size="sm" disabled={itemIndex === 0} onClick={() => selectEvidence(items[itemIndex - 1])} />
            <small>{itemIndex + 1} of {items.length}</small>
            <IconButton icon="fa-chevron-right" ariaLabel="Next evidence" tooltip="Next evidence" size="sm" disabled={itemIndex === items.length - 1} onClick={() => selectEvidence(items[itemIndex + 1])} />
          {/if}
        </nav>
      {/if}
      <div class="evidence-viewer__actions">
        {#key currentEvidence.id}<EvidenceOffenses evidence={currentEvidence} onSaved={saveOffenses} bind:this={offensesControl} />{/key}
        <Button label="Profile" icon="fa-user" onClick={() => openPlayer({ id: currentEvidence.playerId, playfabId: currentEvidence.playfabId, latestName: currentEvidence.nickname })} />
        <IconButton icon="fa-link" ariaLabel="Share evidence" tooltip="Share evidence" expanded={shareOpen} bind:element={shareButton} sfx={null} onClick={share} />
        {#if canDeleteEvidence($authState.user)}<IconButton icon="fa-trash" ariaLabel="Delete evidence" tooltip="Delete evidence" onClick={prepareDeletion} />{/if}
        <IconButton icon="fa-xmark" ariaLabel="Close evidence" tooltip="Close" bind:element={closeButton} onClick={onClose} />
      </div>
    </header>
    <div class="evidence-viewer__content">
      <div class="evidence-viewer__media">
        {#key viewSession}
          {#if currentEvidence.file.kind === `video`}
            <EvidenceVideo src={currentEvidence.file.url} poster={currentEvidence.file.thumbnailLargeUrl ?? null} menuContainer={`#${menusId}`} onView={viewSession.record} {comments} {selectedCommentId} onSelectComment={selectComment} onTimeChange={updateTime} bind:this={videoControl} />
          {:else}
            <img src={currentEvidence.file.url} alt="Evidence screenshot">
          {/if}
        {/key}
      </div>
      <aside class="evidence-viewer__comments">
        <EvidenceDuplicateNotice context="submitted" count={duplicateCount} matches={duplicates} onOpen={id => void openMatching(id)} />
        {#key currentEvidence.id}<EvidenceComments evidence={currentEvidence} {positionMs} getPositionMs={getVideoPosition} onCommentsChange={updateComments} onSeek={seekToComment} onOpenPlayer={openPlayer} bind:this={commentsControl} />{/key}
      </aside>
    </div>
  </div>
  <div class="evidence-viewer__menus" id={menusId}></div>
  <div class="evidence-viewer__share-menu" bind:this={shareMenuRoot}></div>
  {#if confirmDelete}
    <ConfirmModal title="Delete evidence?" message="The evidence file and its comments will be permanently deleted." icon="fa-trash" iconType="light" confirmLabel="Delete evidence" cancelLabel="Cancel" busyLabel="Deleting..." busy={deleting} onConfirm={() => void removeEvidence()} onCancel={() => confirmDelete = false} />
  {/if}
</div>

<style lang="scss">
  .evidence-viewer { position: fixed; z-index: 1000; inset: 0; display: grid; place-items: center; }
  .evidence-viewer__backdrop { position: absolute; inset: 0; border: 0; border-radius: 0; background: rgba(0,0,0,.75); }
  .evidence-viewer__dialog { position: relative; z-index: 1; width: 85vw; height: 85vh; max-width: 85vw; max-height: 85vh; display: grid; grid-template-rows: auto minmax(0, 1fr); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius-xl); color: var(--color-light-primary); background: var(--color-dark-primary); box-shadow: 0 24px 80px rgba(0,0,0,.65); }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); padding: var(--gutter-md); border-bottom: 1px solid var(--color-dark-secondary); }
  .evidence-viewer__heading { min-width: 0; flex: 1 1 180px; display: grid; gap: var(--gutter-sm); margin-right: auto; }
  .evidence-viewer__metadata, .evidence-viewer__views, .evidence-viewer__actions { display: flex; align-items: center; gap: var(--gutter-sm); }
  .evidence-viewer__metadata { flex-wrap: wrap; gap: var(--gutter-md); }
  .evidence-viewer__actions { min-width: 0; flex: 0 1 auto; }
  .evidence-viewer__navigation { flex: 0 0 auto; display: flex; align-items: center; gap: var(--gutter-sm); }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .evidence-viewer__content { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(240px, 28%); }
  .evidence-viewer__media { min-width: 0; min-height: 0; display: grid; place-items: center; overflow: hidden; background: #000; }
  img { width: 100%; height: 100%; max-width: 100%; max-height: 100%; object-fit: contain; }
  .evidence-viewer__comments { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: var(--gutter-md); padding: var(--gutter-md); border-left: 1px solid var(--color-dark-secondary); }
  .evidence-viewer__menus { position: fixed; inset: 0; z-index: 2; pointer-events: none; }
  .evidence-viewer__menus :global(.vds-menu-items) { pointer-events: auto; }
  .evidence-viewer__share-menu { position: fixed; inset: 0; z-index: 3; pointer-events: none; }
  .evidence-viewer__share-menu :global(.infinity-menu), .evidence-viewer__share-menu :global(.infinity-menu__scrim) { pointer-events: auto; }
  @media (max-width: 800px) {
    .evidence-viewer__actions { width: 100%; flex-wrap: wrap; justify-content: flex-end; }
    .evidence-viewer__content { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(220px, 40%); }
    .evidence-viewer__comments { overflow: auto; border-left: 0; border-top: 1px solid var(--color-dark-secondary); }
  }
</style>
