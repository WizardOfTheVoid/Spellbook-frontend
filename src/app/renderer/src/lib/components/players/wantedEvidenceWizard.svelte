<script lang="ts">
  import { onMount } from 'svelte'
  import type { DbPlayerListItem, EvidenceItem } from '$lib/core'
  import { getPlayers } from '$lib/utils/playersApi'
  import { cheatOptions, getEvidence } from '$lib/utils/evidenceApi'
  import { createDbPlayerState } from '$lib/utils/playerStateData'
  import Button from '$lib/components/ui/Button.svelte'
  import SearchField from '$lib/components/ui/SearchField.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import MultiSelect from '$lib/components/ui/MultiSelect.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import EvidenceViewer from './evidenceViewer.svelte'
  import PlayerRow from './PlayerRow.svelte'
  import EvidenceFileRow from './evidenceFileRow.svelte'
  import EvidenceUploadStatus from './evidenceUploadStatus.svelte'
  import EvidenceSubmissionComplete from './evidence/evidenceSubmissionComplete.svelte'
  import { evidenceSubmission } from './evidence/evidenceSubmissionStore'
  import { getAvailableSubmittedEvidence } from './evidence/evidenceSubmission'
  import { createEvidencePlayerSearch } from './evidence/playerSearch'
  import type { EvidencePlayerSelection } from './evidence/navigation'

  export let initialPlayer: EvidencePlayerSelection | null = null
  export let onSubmitted: () => void = () => {}

  let search = ``
  let players: DbPlayerListItem[] = []
  let selectedEvidence: EvidenceItem | null = null
  let viewerItems: EvidenceItem[] = []
  let searchError: string | null = null
  let searching = false
  let disposed = false
  let viewerRevision = 0
  let reviewStatus: `candidate` | `wanted` = `candidate`
  const playerSearch = createEvidencePlayerSearch(
    async query => (await getPlayers({ search: query, page: 1 })).players,
    state => {
      players = state.players
      searching = state.searching
      searchError = state.error
    }
  )

  $: step = $evidenceSubmission.step
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
      playerSearch.cancel()
      unsubscribe()
    }
  })

  function onSearch(event: Event): void {
    search = (event.currentTarget as HTMLInputElement).value
    playerSearch.update(search)
  }

  function findAnotherPlayer(): void {
    search = ``
    playerSearch.cancel()
    void evidenceSubmission.choosePlayer(null)
  }

  async function choosePlayer(selected: EvidencePlayerSelection): Promise<void> {
    playerSearch.cancel()
    await evidenceSubmission.choosePlayer(selected)
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
    search = ``
    searchError = null
    playerSearch.cancel()
    evidenceSubmission.reset(initialPlayer)
  }
</script>

<div class="evidence-wizard">
  <header><h2>Submit evidence</h2><p>{step === `details` ? `File ${fileIndex + 1} of ${drafts.length}` : `Screenshots and videos for players`}</p></header>
  {#if error}<p class="evidence-wizard__error" role="alert">{error}</p>{/if}
  {#if playerState && step !== `player`}<PlayerRow player={playerState} mode="database" readOnly />{/if}
  {#if step === `player`}
    <SearchField bind:value={search} label="Find a player" placeholder="Search name or PlayFab ID" onInput={onSearch} />
    <div class="evidence-wizard__results">
      {#each players as result (result.id)}
        <button type="button" on:click={() => void choosePlayer(result)}><strong>{result.latestName || result.playfabId}</strong><small>{result.playfabId}</small></button>
      {:else}
        <EmptyState title={searching ? `Searching` : search.trim() ? `No players found` : `Find a player`} message={searching ? `Loading players...` : search.trim() ? `Try another name or PlayFab ID.` : `Search by name or PlayFab ID to choose a player.`} />
      {/each}
      {#if /^[A-F0-9]{13,17}$/u.test(search.trim()) && !players.some(result => result.playfabId === search.trim())}
        <button type="button" on:click={() => void choosePlayer({ id: null, playfabId: search.trim(), latestName: null, lastLogin: null, playtimeHours: null, activeBanKind: null, isOnline: false })}><strong>Use PlayFab ID {search.trim()}</strong><small>Player not yet in archive</small></button>
      {/if}
    </div>
  {:else if step === `files`}
    <Button label={busy ? `Checking files...` : `Choose screenshots or videos`} icon="fa-upload" disabled={busy} onClick={() => void evidenceSubmission.chooseFiles()} />
    <div class="evidence-wizard__files">{#each drafts as draft (draft.file.id)}<EvidenceFileRow file={draft.file} onRemove={busy ? null : () => void evidenceSubmission.removeFile(draft.file.id)} onOpen={id => void openDuplicate(id)} />{/each}</div>
    <div class="evidence-wizard__actions">{#if !initialPlayer}<Button label="Back" disabled={busy} onClick={findAnotherPlayer} />{/if}<Button label="Continue" variant="primary" disabled={busy || !drafts.length} onClick={evidenceSubmission.continueToDetails} /></div>
  {:else if step === `details` && current}
    <EvidenceFileRow file={current.file} onOpen={id => void openDuplicate(id)} />
    <Select label="Nickname shown" options={nameOptions} value={current.nicknameId === null ? `none` : String(current.nicknameId)} searchable onChange={value => evidenceSubmission.updateDraft(current.file.id, { nicknameId: value === `none` ? null : Number(value) })} />
    <Select label="Evidence type" options={[{ value: `cheating`, label: `Cheating` }]} value="cheating" disabled />
    <MultiSelect label="Cheat subtypes shown" options={cheatOptions} value={current.subtypes} onChange={value => evidenceSubmission.updateDraft(current.file.id, { subtypes: value })} />
    <div class="evidence-wizard__actions"><Button label="Back" onClick={evidenceSubmission.back} /><Button label={fileIndex + 1 < drafts.length ? `Next file` : `Review`} variant="primary" onClick={evidenceSubmission.nextFile} /></div>
  {:else if step === `review`}
    <h3>Review</h3>
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
  header h2, header p, h3, p { margin: 0; }
  header p, small { color: var(--color-light-tertiary); }
  .evidence-wizard__results { display: grid; gap: var(--gutter-sm); max-height: 42vh; overflow: auto; }
  .evidence-wizard__results button { display: grid; gap: 4px; text-align: left; padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); color: var(--color-light-primary); background: transparent; cursor: pointer; }
  .evidence-wizard__results button:hover { border-color: var(--color-accent-primary); }
  .evidence-wizard__actions { display: flex; justify-content: flex-end; gap: var(--gutter-sm); }
  .evidence-wizard__files { display: grid; gap: var(--gutter-sm); }
  .evidence-wizard__error { color: var(--color-danger); }
</style>
