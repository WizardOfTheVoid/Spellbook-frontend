<script lang="ts">
  import { onMount } from 'svelte'
  import type { TeamGuidelines, TeamGuidelineRevision } from '@spellbook/shared/teamSettings'
  import { createTeamEditor } from './teamEditor'
  import { unsavedChanges } from '$lib/utils/unsavedChanges'
  import { unwrap } from '$lib/utils/apiResult'
  import { notifySuccess } from '$lib/notifications/notificationEvents'
  import Button from '$lib/components/ui/Button.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import MarkdownEditor from '$lib/components/ui/markdown/markdownEditor.svelte'

  export let teamId: number
  export let canEdit = false
  const editor = createTeamEditor<TeamGuidelines>(() => window.chivServer.teams.guidelines(teamId), value => window.chivServer.teams.saveGuidelines(teamId, value))
  let history: TeamGuidelineRevision[] = []
  let selectedRevision = ``
  let historyError = ``
  let loadingHistory = false
  let historyLoaded = false
  let disposed = false
  $: if (!canEdit) selectedRevision = ``
  $: selected = history.find(value => String(value.revision) === selectedRevision)
  onMount(() => {
    const unregister = unsavedChanges.register(() => $editor.busy || editor.dirty())
    void editor.load()
    return () => {
      disposed = true
      unregister()
      editor.dispose()
    }
  })
  async function save() {
    if (!canEdit || selectedRevision || !await editor.save()) return
    notifySuccess(`Guidelines saved.`)
    history = []
    historyLoaded = false
    selectedRevision = ``
  }
  async function loadHistory() {
    if (!canEdit || loadingHistory) return
    loadingHistory = true
    historyError = ``
    try {
      const rows = await unwrap<TeamGuidelineRevision[]>(await window.chivServer.teams.guidelineHistory(teamId, history.at(-1)?.revision), `History request failed.`)
      if (!disposed) {
        history = [...history, ...rows]
        historyLoaded = true
      }
    } catch (error) { if (!disposed) historyError = error instanceof Error ? error.message : `History request failed.` }
    finally { loadingHistory = false }
  }
</script>

<div class="team-guidelines grid-stack gap-1">
  {#if $editor.error}<p role="alert">{$editor.error}</p>{/if}
  {#if canEdit}<div class="guideline-actions">
    <Button label="Save guidelines" icon="fa-floppy-disk" variant="primary" disabled={$editor.busy || loadingHistory || Boolean(selectedRevision) || !editor.dirty()} onClick={() => void save()} />
    <Button label="Reload" icon="fa-rotate" disabled={$editor.busy} onClick={async () => { if (await unsavedChanges.canLeave()) await editor.load() }} />
    <Button label={historyLoaded ? `Load older revisions` : `Revision history`} icon="fa-clock-rotate-left" disabled={loadingHistory || $editor.busy} onClick={() => void loadHistory()} />
  </div>{/if}
  {#if $editor.value}
    {#if canEdit && historyLoaded}<Select label="Revision" value={selectedRevision} options={[{ value: ``, label: `Current guidelines` }, ...history.map(value => ({ value: String(value.revision), label: `#${value.revision} · ${value.authorName} · ${new Date(value.createdAt).toLocaleString()}` }))]} onChange={value => selectedRevision = value} />{/if}
    {#if canEdit && historyError}<p role="alert">{historyError}</p>{/if}
    {#key selectedRevision}
      <MarkdownEditor label="Guidelines" value={selected?.content ?? $editor.value.content} editable={canEdit && !selectedRevision} disabled={$editor.busy} onChange={content => { if (canEdit && !selectedRevision) editor.change({ content }) }} />
    {/key}
  {:else if $editor.busy}<p>Loading guidelines…</p>{/if}
</div>

<style>
  .team-guidelines { flex: 1; min-height: 0; }
  .guideline-actions { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
</style>
