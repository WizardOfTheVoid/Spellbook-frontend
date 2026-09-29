<script lang="ts">
  import { onMount } from 'svelte'
  import type { EvidenceItem } from '$lib/core'
  import { cheatOptions, getEvidence } from '$lib/utils/evidenceApi'
  import { createDbPlayerState } from '$lib/utils/playerStateData'
  import Button from '$lib/components/ui/Button.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import MultiSelect from '$lib/components/ui/MultiSelect.svelte'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
  import InfoNotice from '$lib/components/ui/infoNotice.svelte'
  import EvidenceViewer from './evidenceViewer.svelte'
  import PlayerRow from './PlayerRow.svelte'
  import PlayerArchive from './PlayerArchive.svelte'
  import EvidenceFileRow from './evidenceFileRow.svelte'
  import EvidenceUploadStatus from './evidenceUploadStatus.svelte'
  import EvidenceSubmissionComplete from './evidence/evidenceSubmissionComplete.svelte'
  import { evidenceSubmission } from './evidence/evidenceSubmissionStore'
  import { getAvailableSubmittedEvidence } from './evidence/evidenceSubmission'
  import { evidencePlayerSelection, type EvidencePlayerSelection } from './evidence/navigation'

  export let initialPlayer: EvidencePlayerSelection | null = null
  export let onSubmitted: () => void = () => {}

  let selectedEvidence: EvidenceItem | null = null
  let viewerItems: EvidenceItem[] = []
  let searchError: string | null = null
  let disposed = false
  let viewerRevision = 0
  let reviewStatus: `candidate` | `wanted` = `candidate`

  $: step = $evidenceSubmission.step
  $: stage = step === `details` ? `File ${fileIndex + 1} of ${drafts.length}` : ({ player: `Player`, files: `Files`, review: `Review`, submitting: `Processing`, done: `Complete` })[step]
  $: player = $evidenceSubmission.player
  $: names = $evidenceSubmission.names
  $: drafts = $evidenceSubmission.drafts
  $: fileIndex = $evidenceSubmission.fileIndex
  $: results = $evidenceSubmission.results
  $: availableResults = getAvailableSubmittedEvidence($evidenceSubmission)
  $: submitted = results.length
  $: busy = $evidenceSubmission.busy
  $: error = $evidenceSubmission.error ?? searchError
  $: progress = $evidenceSubmission.progress
  $: startedAt = $evidenceSubmission.startedAt
  $: reviewStatus = results.some(result => result.reviewStatus !== `wanted`) ? `candidate` : `wanted`
  $: current = drafts[fileIndex]
  $: playerState = player ? createDbPlayerState({ ...player, id: player.id ?? 0 }) : null
  $: nameOptions = [{ value: `none`, label: `None listed` }, ...names.map(name => ({ value: String(name.id), label: name.name }))]

  onMount(() => {
    void evidenceSubmission.initialize(initialPlayer)
    let completed = false
    let userId = $evidenceSubmission.userId
    const unsubscribe = evidenceSubmission.subscribe(state => {
      if (userId !== state.userId) {
        selectedEvidence = null
        viewerRevision += 1
        userId = state.userId
      }
      if (state.step === `done` && !completed) {
        completed = true
        onSubmitted()
      }
      if (state.step !== `done`) completed = false
    })
    return () => {
      disposed = true
      unsubscribe()
    }
  })

  function findAnotherPlayer(): void {
    void evidenceSubmission.choosePlayer(null)
  }

  async function openDuplicate(id: number): Promise<void> {
    const revision = ++viewerRevision
    const userId = $evidenceSubmission.userId
    try {
      const evidence = await getEvidence(id)
      if (disposed || revision !== viewerRevision || userId !== $evidenceSubmission.userId) return
      viewerItems = [evidence]
      selectedEvidence = evidence
    } catch (cause) { if (!disposed && revision === viewerRevision) searchError = cause instanceof Error ? cause.message : `Evidence could not be opened.` }
  }

  function viewSubmitted(): void {
    viewerRevision += 1
    viewerItems = availableResults
    selectedEvidence = availableResults[0] ?? null
  }

  function submitMore(): void {
    searchError = null
    evidenceSubmission.reset(initialPlayer)
  }
</script>

<div class="evidence-wizard" class:evidence-wizard--player={step === `player`}>
  <div class="evidence-wizard__header"><PanelHeader title="Submit evidence" variant="section"><small slot="subtitle">{stage}</small></PanelHeader></div>
  {#if error}<p class="evidence-wizard__error" role="alert">{error}</p>{/if}
  {#if playerState && step !== `player`}<PlayerRow player={playerState} mode="database" readOnly />{/if}
  {#if step === `player`}
    <div class="evidence-wizard__search">
      <PlayerArchive searchOnly active={$evidenceSubmission.userId !== null}
        onSelect={selected => void evidenceSubmission.choosePlayer(evidencePlayerSelection(selected))}
        onSelectPlayfabId={playfabId => void evidenceSubmission.choosePlayer({ id: null, playfabId, latestName: null, lastLogin: null, playtimeHours: null, activeBanKind: null, isOnline: false })} />
    </div>
  {:else if step === `files`}
    <Button label={busy ? `Checking files...` : `Choose screenshots or videos`} icon="fa-upload" disabled={busy} onClick={() => void evidenceSubmission.chooseFiles()} />
    <div class="evidence-wizard__files">{#each drafts as draft (draft.file.id)}<EvidenceFileRow file={draft.file} onRemove={busy ? null : () => void evidenceSubmission.removeFile(draft.file.id)} onOpen={id => void openDuplicate(id)} />{/each}</div>
    <div class="evidence-wizard__actions">{#if !initialPlayer}<Button label="Back" disabled={busy} onClick={findAnotherPlayer} />{/if}<Button label="Continue" variant="primary" disabled={busy || !drafts.length} onClick={evidenceSubmission.continueToDetails} /></div>
  {:else if step === `details` && current}
    <EvidenceFileRow file={current.file} onOpen={id => void openDuplicate(id)} />
    <Select label="Nickname shown" options={nameOptions} value={current.nicknameId === null ? `none` : String(current.nicknameId)} searchable onChange={value => evidenceSubmission.updateDraft(current.file.id, { nicknameId: value === `none` ? null : Number(value) })} />
    <InfoNotice message="Evidence type: Cheating" icon="fa-shield-halved" tone="var(--color-light-secondary)" />
    <MultiSelect label="Cheat subtypes shown" options={cheatOptions} value={current.subtypes} onChange={value => evidenceSubmission.updateDraft(current.file.id, { subtypes: value })} />
    <div class="evidence-wizard__actions"><Button label="Back" onClick={evidenceSubmission.back} /><Button label={fileIndex + 1 < drafts.length ? `Next file` : `Review`} variant="primary" onClick={evidenceSubmission.nextFile} /></div>
  {:else if step === `review`}
    <p>{drafts.length} file{drafts.length === 1 ? `` : `s`}</p>
    <div class="evidence-wizard__files">{#each drafts as draft, index (draft.file.id)}<EvidenceFileRow file={draft.file} context={index < submitted ? `submitted` : `upload`} detail={`${draft.nicknameId === null ? `None listed` : names.find(name => name.id === draft.nicknameId)?.name} · ${draft.subtypes.map(value => cheatOptions.find(option => option.value === value)?.label).join(`, `)}${index < submitted ? ` · Submitted` : ``}`} onOpen={id => void openDuplicate(id)} />{/each}</div>
    <div class="evidence-wizard__actions"><Button label="Back" disabled={submitted > 0} onClick={evidenceSubmission.back} /><Button label={submitted ? `Retry remaining` : `Submit evidence`} variant="primary" onClick={() => void evidenceSubmission.submit()} /></div>
  {:else if step === `submitting`}
    {#if drafts[submitted]}<EvidenceUploadStatus file={drafts[submitted].file} fileIndex={submitted} fileCount={drafts.length} {progress} {startedAt} />{/if}
  {:else if step === `done`}
    <EvidenceSubmissionComplete {reviewStatus} canView={availableResults.length > 0} onView={viewSubmitted} onMore={submitMore} />
  {/if}
</div>
{#if selectedEvidence}<EvidenceViewer evidence={selectedEvidence} items={viewerItems} onClose={() => selectedEvidence = null} onDeleted={evidenceSubmission.markEvidenceDeleted} />{/if}

<style lang="scss">
  .evidence-wizard { min-height: 0; overflow: auto; display: grid; align-content: start; gap: var(--gutter-lg); padding: 0 var(--gutter-lg) var(--gutter-lg); }
  .evidence-wizard--player { display: flex; flex-direction: column; overflow: hidden; padding: 0; }
  .evidence-wizard--player > .evidence-wizard__header, .evidence-wizard--player > .evidence-wizard__error { margin: 0 var(--gutter-lg); }
  .evidence-wizard__search { min-height: 0; flex: 1; display: grid; }
  p { margin: 0; }
  .evidence-wizard__header small { color: var(--color-light-tertiary); }
  .evidence-wizard__actions { display: flex; justify-content: flex-end; gap: var(--gutter-sm); }
  .evidence-wizard__files { display: grid; gap: var(--gutter-sm); }
  .evidence-wizard__error { color: var(--color-danger); }
</style>
