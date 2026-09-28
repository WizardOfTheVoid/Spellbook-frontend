<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { WantedCandidateDetail } from '$lib/core'
  import { decideWantedCandidate, getWantedCandidate } from '$lib/utils/wantedCandidateApi'
  import { formatShortRelativeDateTime } from '$lib/utils/playerUtils'
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
  <div class="candidate-detail__header">
    {#if detail}
      <div class="candidate-detail__identity"><h2>{detail.player.latestName || detail.player.playfabId}</h2><small>{detail.player.playfabId} · {detail.candidate.evidenceCount} evidence file{detail.candidate.evidenceCount === 1 ? `` : `s`} · Updated {formatShortRelativeDateTime(detail.candidate.lastEvidenceAt)}</small></div>
      <div class="candidate-detail__navigation">
        <Button label="Add evidence" icon="fa-upload" disabled={busy} onClick={() => detail && requestEvidenceNavigation(`add`, detail.player)} />
        <Button label="Profile" icon="fa-user" disabled={busy} onClick={() => detail && requestOpenPlayerReference(detail.player)} />
      </div>
    {/if}
  </div>
  {#if error}<p role="alert" class="candidate-detail__error">{error}</p>{/if}
  {#if detail}
    <div class="candidate-detail__body">
      <div bind:this={gallery}><WantedEvidenceGallery playerId={detail.player.id} {openEvidenceId} evidenceCount={detail.player.evidenceCount ?? detail.candidate.evidenceCount} onCountChange={updateEvidenceCount.bind(null, detail.player.id)} /></div>
      {#if detail.candidate.status === `pending`}
        <div class="candidate-detail__review">
          <Textarea label="Review note (optional)" value={note} maxlength={1000} rows={3} bind:element={noteElement} onChange={value => note = value} />
          <div class="candidate-detail__actions">
            <Button label={busy ? `Reviewing...` : `Reject`} disabled={busy} onClick={() => void decide(`reject`)} />
            <Button label={busy ? `Reviewing...` : `Accept to Wanted`} variant="primary" disabled={busy} onClick={() => void decide(`accept`)} />
          </div>
        </div>
      {/if}
    </div>
  {:else if loading}
    <EmptyState title="Loading candidate" message="Fetching player and evidence..." />
  {/if}
</section>

<style lang="scss">
  .candidate-detail { min-height: 0; overflow: auto; display: grid; align-content: start; gap: var(--gutter-lg); padding: 0 var(--gutter-lg) var(--gutter-lg); }
  .candidate-detail__header { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-md); }
  .candidate-detail__identity { min-width: 0; flex: 1 1 220px; overflow-wrap: anywhere; }
  .candidate-detail__navigation { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
  .candidate-detail__header h2 { margin: 0; }
  .candidate-detail__header small { color: var(--color-light-tertiary); }
  .candidate-detail__body { display: grid; gap: var(--gutter-lg); }
  .candidate-detail__review { display: grid; gap: var(--gutter-md); max-width: 600px; }
  .candidate-detail__actions { display: flex; gap: var(--gutter-sm); }
  .candidate-detail__error { margin: 0; color: var(--color-danger); }
</style>
