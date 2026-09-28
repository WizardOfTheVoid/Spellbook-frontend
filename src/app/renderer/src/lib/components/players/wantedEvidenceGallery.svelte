<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import type { EvidenceItem } from '$lib/core'
  import { listEvidence } from '$lib/utils/evidenceApi'
  import { formatShortRelativeDateTime } from '$lib/utils/playerUtils'
  import { tooltip as tooltipAction } from '$lib/utils/tooltip'
  import Button from '$lib/components/ui/Button.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import IconBadge from '$lib/components/ui/IconBadge.svelte'
  import EvidenceViewer from './evidenceViewer.svelte'
  import EvidenceTags from './evidence/evidenceTags.svelte'

  export let playerId: number
  export let openEvidenceId: number | null = null
  export let onCountChange: (count: number) => void = () => undefined
  export let evidenceCount: number | null = null
  let items: EvidenceItem[] = []
  let selected: EvidenceItem | null = null
  let loading = false
  let error: string | null = null
  let loadedId = 0
  let loadRevision = 0
  let disposed = false

  $: if (playerId !== loadedId) { loadedId = playerId; void load() }
  $: if (openEvidenceId && items.length && selected?.id !== openEvidenceId) selected = items.find(item => item.id === openEvidenceId) ?? null
  onMount(() => { if (playerId && !items.length) void load() })
  onDestroy(() => { disposed = true })

  async function load(): Promise<void> {
    const revision = ++loadRevision
    loading = true
    error = null
    const id = playerId
    try {
      const loaded = await listEvidence(id)
      if (disposed || playerId !== id || revision !== loadRevision) return
      items = loaded
      if (selected && !items.some(item => item.id === selected?.id)) selected = null
    }
    catch (cause) { if (!disposed && revision === loadRevision) error = cause instanceof Error ? cause.message : `Evidence could not be loaded.` }
    finally { if (!disposed && revision === loadRevision) loading = false }
  }

  function updateItem(updated: EvidenceItem): void {
    items = items.map(item => item.id === updated.id ? updated : item)
  }
</script>

<div class="evidence-gallery">
  <div class="evidence-gallery__toolbar"><h2>Evidence</h2><Button label="Refresh" icon="fa-rotate" size="sm" disabled={loading} onClick={() => void load()} /></div>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if !items.length}<EmptyState title={loading ? `Loading evidence` : `No evidence yet`} message={loading ? `Fetching converted evidence...` : `Admins can add screenshots and videos from Submit evidence.`} />{/if}
  <div class="evidence-gallery__grid">
    {#each items as item (item.id)}
      <button class="evidence-gallery__card" type="button" on:click={() => selected = item}>
        <span class="evidence-gallery__preview">
          {#if item.file.thumbnailSmallUrl || item.file.kind === `image`}<img src={item.file.thumbnailSmallUrl ?? item.file.url} alt="">{/if}
          {#if item.file.kind === `video`}<span class="evidence-gallery__play"><IconBadge name="fa-play" size="sm" shape="round" variant="solid" tone="bright" /></span>{/if}
        </span>
        <span class="evidence-gallery__details">
          <EvidenceTags subtypes={item.subtypes} />
          <span class="evidence-gallery__metadata">
            <strong>{item.nickname || `No nickname listed`}</strong>
            <span class="evidence-gallery__stats">
              <small aria-label={`Added ${formatShortRelativeDateTime(item.createdAt)}`} use:tooltipAction={`Added`}><Icon name="fa-clock" size="sm" /><time datetime={item.createdAt}>{formatShortRelativeDateTime(item.createdAt)}</time></small>
              <small aria-label={`Views: ${item.viewCount ?? 0}`} use:tooltipAction={`Views`}><Icon name="fa-eye" size="sm" />{item.viewCount ?? 0}</small>
              <small aria-label={`Comments: ${item.commentCount ?? 0}`} use:tooltipAction={`Comments`}><Icon name="fa-comments" size="sm" />{item.commentCount ?? 0}</small>
            </span>
          </span>
          {#if item.duplicateCount > 0}<span class="evidence-gallery__duplicate"><IconBadge name="fa-clone" size="sm" tone="warning" /><small>Duplicate evidence · {item.duplicateCount} other file{item.duplicateCount === 1 ? `` : `s`}</small></span>{/if}
        </span>
      </button>
    {/each}
  </div>
</div>
{#if selected}<EvidenceViewer evidence={selected} onUpdated={updateItem} onClose={() => { selected = null; openEvidenceId = null }} onDeleted={id => { const listed = items.some(item => item.id === id); items = items.filter(item => item.id !== id); if (listed && evidenceCount !== null) onCountChange(Math.max(0, evidenceCount - 1)); void load() }} />{/if}

<style lang="scss">
  .evidence-gallery { min-height: 0; display: grid; align-content: start; gap: var(--gutter-md); }
  .evidence-gallery__toolbar { display: flex; align-items: center; justify-content: space-between; }
  h2, p { margin: 0; }
  .evidence-gallery__grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: var(--gutter-md); }
  .evidence-gallery__card { min-width: 0; display: flex; flex-direction: column; gap: var(--gutter-md); text-align: left; padding: var(--gutter-md); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); color: var(--color-light-primary); background: rgba(3,12,18,.36); cursor: pointer; }
  .evidence-gallery__card:hover { border-color: var(--color-accent-primary); }
  .evidence-gallery__preview { position: relative; width: 100%; display: grid; place-items: center; height: 120px; border-radius: var(--radius); overflow: hidden; background: #000; }
  .evidence-gallery__preview img { width: 100%; height: 100%; object-fit: contain; }
  .evidence-gallery__play { position: absolute; }
  .evidence-gallery__details { min-width: 0; width: 100%; flex: 1; display: flex; flex-direction: column; gap: var(--gutter-md); }
  .evidence-gallery__metadata { display: grid; gap: var(--gutter-sm); }
  .evidence-gallery__stats { display: flex; flex-wrap: wrap; gap: var(--gutter-md); }
  .evidence-gallery__stats small { display: inline-flex; align-items: center; gap: var(--gutter-sm); }
  small { color: var(--color-light-tertiary); }
  .evidence-gallery__duplicate { margin-top: auto; display: flex; align-items: center; gap: var(--gutter-sm); padding-top: var(--gutter-md); border-top: 1px solid var(--color-dark-secondary); }
  .evidence-gallery__duplicate small { color: var(--color-accent-tertiary); }
</style>
