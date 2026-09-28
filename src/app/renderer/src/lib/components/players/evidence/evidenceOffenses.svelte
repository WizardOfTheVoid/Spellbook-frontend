<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { EvidenceItem } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import { updateEvidenceOffenses } from '$lib/utils/evidenceApi'
  import { fetchAllPlayerActions } from '$lib/utils/playerActionsApi'
  import Button from '$lib/components/ui/Button.svelte'
  import MultiSelect from '$lib/components/ui/MultiSelect.svelte'
  import { createEvidenceOffenseEditor, evidenceOffenseOptions } from './evidenceOffenseEditor'

  export let evidence: EvidenceItem
  export let onSaved: (offenseIds: number[]) => void
  let select: MultiSelect | undefined
  const editor = createEvidenceOffenseEditor(evidence, {
    load: fetchAllPlayerActions,
    save: updateEvidenceOffenses,
    onSaved: ids => onSaved(ids)
  })

  $: editor.syncIds(evidence.offenseIds ?? [])
  $: options = evidenceOffenseOptions($editor.actions, evidence.playerId, $editor.offenseIds)
  $: disabled = !$authState.user?.isActive || $editor.loading || $editor.saving
  onMount(() => { void editor.load() })
  onDestroy(editor.dispose)

  export function dismissDropdown(): boolean {
    return select?.close() ?? false
  }
</script>

<div class="evidence-offenses" aria-busy={$editor.loading || $editor.saving}>
  <div class="evidence-offenses__controls">
    <MultiSelect bind:this={select} ariaLabel="Linked offenses" placeholder={$editor.loading ? `Loading offenses...` : `Link to offenses`} {options} value={$editor.offenseIds.map(id => `${id}`)} {disabled} onChange={ids => editor.setIds(ids.map(Number))} />
    {#if $editor.dirty || $editor.saving}
      <Button label={$editor.saving ? `Saving...` : `Save`} size="sm" variant="primary" {disabled} onClick={() => void editor.save()} />
    {/if}
  </div>
  {#if $editor.error}
    <div class="evidence-offenses__error" role="alert">
      <small>{$editor.error}</small>
      {#if !$editor.dirty}<Button label="Retry" size="sm" disabled={$editor.loading} onClick={() => void editor.load()} />{/if}
    </div>
  {/if}
</div>

<style lang="scss">
  .evidence-offenses { min-width: 0; width: clamp(220px, 24vw, 380px); display: grid; gap: var(--gutter-sm); }
  .evidence-offenses__controls { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: var(--gutter-sm); }
  .evidence-offenses :global(.ui-multi-select__values) { max-height: calc(var(--control-height-md) * 2); overflow-y: auto; }
  .evidence-offenses__error { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-sm); }
  small { color: var(--color-danger-primary); font-size: var(--font-size-xs); }
  @media (max-width: 800px) { .evidence-offenses { flex: 1 1 220px; width: auto; } }
</style>
