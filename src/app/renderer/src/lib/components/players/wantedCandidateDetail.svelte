<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { WantedCandidateDetail } from '$lib/core'
  import { decideWantedCandidate, getWantedCandidate } from '$lib/utils/wantedCandidateApi'
  import DateStamp from '$lib/components/ui/dateStamp.svelte'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
  import { notifySuccess } from '$lib/notifications/notificationEvents'
  import Button from '$lib/components/ui/Button.svelte'
  import Textarea from '$lib/components/ui/Textarea.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import WantedEvidenceGallery from './wantedEvidenceGallery.svelte'
  import { openPlayerInfinityMenu } from './playerInfinityMenu'
  import { createContextMenuRequest } from './playerMenuRequests'
  import { requestEvidenceNavigation, requestOpenPlayerReference } from './evidence/navigation'
  import { ApiResultError } from '$lib/utils/apiResult'

  export let candidateId: number
  export let openEvidenceId: number | null = null
  export let onDecided: () => void
  export let onBack: () => void
  let detail: WantedCandidateDetail | null = null
  let loadedId = 0
  let loading = false
  let busy = false
  let note = ``
  let noteElement: HTMLTextAreaElement
  let error: string | null = null
  let gallery: HTMLDivElement
  let loadRevision = 0

  $: if (candidateId !== loadedId) { loadedId = candidateId; void load() }
  onDestroy(() => loadRevision += 1)

  async function load(closeMissing = false): Promise<void> {
    const revision = ++loadRevision
    const id = candidateId
    loading = true
    error = null
    detail = null
    try {
      const loaded = await getWantedCandidate(id)
      if (revision === loadRevision && id === candidateId) detail = loaded
    } catch (cause) {
      if (revision !== loadRevision || id !== candidateId) return
      if (closeMissing && cause instanceof ApiResultError && cause.status === 404) onDecided()
      else error = cause instanceof Error ? cause.message : `Candidate could not be loaded.`
    } finally { if (revision === loadRevision) loading = false }
  }

  async function decide(decision: `accept` | `reject`): Promise<void> {
    if (!detail || busy) return
    busy = true
    error = null
    try {
      await decideWantedCandidate(detail.candidate.id, detail.candidate.revision, decision, note)
      notifySuccess(decision === `accept` ? `Player added to Wanted.` : `Candidate rejected.`)
      onDecided()
    } catch (cause) {
      error = cause instanceof Error ? cause.message : `Candidate review failed.`
      if (error.includes(`changed`) || error.includes(`Wanted`)) await load()
    } finally { busy = false }
  }

  function openContextMenu(event: MouseEvent): void {
    if (!detail) return
    const selected = detail
    const request = createContextMenuRequest(event)
    openPlayerInfinityMenu(request.position, request.owner, {
      playerId: selected.player.id, playfabId: selected.player.playfabId,
      name: selected.player.latestName || selected.player.playfabId,
      evidenceCount: selected.player.evidenceCount ?? selected.candidate.evidenceCount,
      onOpen: () => requestOpenPlayerReference(selected.player),
      onAddEvidence: () => requestEvidenceNavigation(`add`, selected.player),
      onViewEvidence: () => gallery?.scrollIntoView({ block: `start` })
    })
  }

  function updateEvidenceCount(playerId: number, count: number): void {
    if (!detail || detail.player.id !== playerId || count === (detail.player.evidenceCount ?? detail.candidate.evidenceCount)) return
    detail = { ...detail, player: { ...detail.player, evidenceCount: count } }
    void load(true)
  }
</script>

<section class="candidate-detail" aria-label="Wanted candidate" on:contextmenu={openContextMenu}>
  <PanelHeader title={detail ? detail.player.latestName || detail.player.playfabId : `Candidate review`} variant="section" leadingIcon="fa-arrow-left" leadingLabel="Back to candidates" leadingDisabled={busy} onLeading={onBack}>
    <svelte:fragment slot="subtitle">{#if detail}<small>{detail.player.playfabId} · {detail.player.evidenceCount ?? detail.candidate.evidenceCount} evidence file{(detail.player.evidenceCount ?? detail.candidate.evidenceCount) === 1 ? `` : `s`} · Updated <DateStamp value={detail.candidate.lastEvidenceAt} format="relative" styled={false} /></small>{/if}</svelte:fragment>
    <svelte:fragment slot="trailing">{#if detail}
      <div class="candidate-detail__navigation">
        <Button label="Add evidence" icon="fa-upload" disabled={busy} onClick={() => detail && requestEvidenceNavigation(`add`, detail.player)} />
        <Button label="Profile" icon="fa-user" disabled={busy} onClick={() => detail && requestOpenPlayerReference(detail.player)} />
      </div>
    {/if}</svelte:fragment>
  </PanelHeader>
  {#if error}<p role="alert" class="candidate-detail__error">{error}</p>{/if}
  {#if detail}
    <div class="candidate-detail__body">
      <div bind:this={gallery}><WantedEvidenceGallery playerId={detail.player.id} {openEvidenceId} evidenceCount={detail.player.evidenceCount ?? detail.candidate.evidenceCount} onCountChange={updateEvidenceCount.bind(null, detail.player.id)} /></div>
    </div>
    {#if detail.candidate.status === `pending`}
        <footer class="candidate-detail__review">
          <Textarea label="Review note (optional)" value={note} maxlength={1000} rows={2} disabled={busy} bind:element={noteElement} onChange={value => note = value} />
          <div class="candidate-detail__actions">
            <small>Pending review</small>
            <Button label={busy ? `Reviewing...` : `Reject`} disabled={busy} onClick={() => void decide(`reject`)} />
            <Button label={busy ? `Reviewing...` : `Accept to Wanted`} variant="primary" disabled={busy} onClick={() => void decide(`accept`)} />
          </div>
        </footer>
      {/if}
  {:else if loading}
    <EmptyState title="Loading candidate" message="Fetching player and evidence..." />
  {/if}
</section>

<style lang="scss">
  .candidate-detail { min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: var(--gutter-md); padding: 0 var(--gutter-lg) var(--gutter-lg); }
  .candidate-detail__navigation { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .candidate-detail__body { min-height: 0; flex: 1; overflow: auto; }
  .candidate-detail__review { flex: 0 0 auto; display: grid; gap: var(--gutter-sm); padding-top: var(--gutter-md); border-top: 1px solid var(--color-dark-secondary); }
  .candidate-detail__actions { display: flex; align-items: center; gap: var(--gutter-sm); }
  .candidate-detail__actions small { margin-right: auto; }
  .candidate-detail__error { margin: 0; color: var(--color-danger); }
</style>
