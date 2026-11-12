<script lang="ts">
  import type { EvidenceDuplicatePreview } from '$lib/utils/evidenceDuplicates'
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import EvidenceDuplicateNotice from './evidenceDuplicateNotice.svelte'

  export let file: EvidenceDuplicatePreview
  export let detail = ``
  export let context: `upload` | `submitted` = `upload`
  export let onRemove: (() => void) | null = null
  export let onOpen: (id: number) => void

  $: size = file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`
</script>

<div class="evidence-file-row">
  <ListRow title={file.name} subtitle={`${file.kind === `video` ? `Video` : `Screenshot`} · ${size}`}>
    <svelte:fragment slot="leading"><Icon name={file.kind === `video` ? `fa-film` : `fa-image`} tone="var(--color-light-tertiary)" /></svelte:fragment>
    <svelte:fragment slot="meta">
      {#if detail}<small>{detail}</small>{/if}
      <EvidenceDuplicateNotice count={file.duplicateCount} matches={file.duplicates} checking={file.status === `checking`} {context} {onOpen} />
    </svelte:fragment>
    <svelte:fragment slot="trailing">
      {#if onRemove}<IconButton icon="fa-xmark" ariaLabel={`Remove ${file.name}`} tooltip="Remove file" hasPopup={null} onClick={onRemove} />{/if}
    </svelte:fragment>
  </ListRow>
</div>

<style lang="scss">
  .evidence-file-row { min-width: 0; }
  .evidence-file-row :global(.list-row__title strong) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  small { color: var(--color-light-tertiary); }
</style>
