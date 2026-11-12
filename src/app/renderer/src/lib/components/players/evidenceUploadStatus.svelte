<script lang="ts">
  import { onMount } from 'svelte'
  import type { EvidenceProgress, EvidenceSelectedFile } from '$lib/core'
  import Icon from '$lib/components/ui/Icon.svelte'
  import ProgressBar from '$lib/components/ui/progressBar.svelte'

  export let file: EvidenceSelectedFile
  export let fileIndex: number
  export let fileCount: number
  export let progress: EvidenceProgress
  export let startedAt: number
  let now = Date.now()

  const labels = { uploading: `Uploading evidence`, probing: `Checking file`, reusing: `Reusing existing media`, converting: `Converting evidence`, validating: `Checking converted file`, saving: `Saving evidence` }
  $: phaseLabel = progress.phase === `converting` ? file.kind === `video` ? `Converting video` : `Converting screenshot` : labels[progress.phase]
  $: label = `${phaseLabel}, file ${fileIndex + 1} of ${fileCount}`
  $: percent = progress.total ? Math.min(100, Math.floor(progress.completed / progress.total * 100)) : null
  $: seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  $: elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, `0`)}`
  $: measured = progress.phase === `uploading` && progress.total
    ? `${(progress.completed / 1024 / 1024).toFixed(1)} / ${(progress.total / 1024 / 1024).toFixed(1)} MB`
    : progress.phase === `converting` && progress.total
      ? `${(progress.completed / 1000).toFixed(1)} / ${(progress.total / 1000).toFixed(1)} seconds converted`
      : progress.phase === `converting` ? `Preparing your screenshot` : progress.phase === `reusing` ? `Using the converted identical file` : `Please wait…`

  onMount(() => {
    const timer = setInterval(() => now = Date.now(), 1000)
    return () => clearInterval(timer)
  })
</script>

<section class="evidence-upload-status" aria-busy="true">
  <div class="evidence-upload-status__heading" role="status">
    <span class="evidence-upload-status__icon"><Icon name="fa-spinner fa-spin" size="lg" tone="var(--color-accent-primary)" /></span>
    <div><small>File {fileIndex + 1} of {fileCount}</small><h3>{phaseLabel}</h3><p title={file.name}>{file.name}</p></div>
  </div>
  <div class="evidence-upload-status__progress">
    <div><small>{measured}</small>{#if percent !== null}<strong>{percent}%</strong>{/if}</div>
    <ProgressBar value={progress.total === null ? null : progress.completed} max={progress.total ?? 100} {label} />
  </div>
  <footer><small>{fileIndex} of {fileCount} completed</small><small>Elapsed {elapsed}</small></footer>
  <p class="evidence-upload-status__hint">{file.kind === `video` && progress.phase === `converting` ? `Video conversion can take several minutes. ` : ``}You can leave this page while processing continues.</p>
</section>

<style lang="scss">
  .evidence-upload-status { display: grid; gap: var(--gutter-lg); padding: var(--gutter-lg); border: 1px solid #{rgbaa(var(--color-accent-primary), .22)}; border-radius: var(--radius-xl); background: #{rgbaa(var(--color-accent-primary), .04)}; }
  .evidence-upload-status__heading { display: flex; align-items: center; gap: var(--gutter-md); }
  .evidence-upload-status__heading > div { min-width: 0; }
  .evidence-upload-status__icon { display: grid; place-items: center; flex: 0 0 48px; height: 48px; border-radius: 50%; background: #{rgbaa(var(--color-accent-primary), .08)}; }
  h3, p { margin: 0; }
  h3 { margin-top: 4px; font-size: var(--font-size-lg); }
  p { margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  p, small { color: var(--color-light-tertiary); }
  .evidence-upload-status__progress { display: grid; gap: var(--gutter-sm); }
  .evidence-upload-status__progress > div, footer { display: flex; justify-content: space-between; gap: var(--gutter-sm); }
  strong { color: var(--color-accent-primary); font-size: var(--font-size-sm); }
  .evidence-upload-status__hint { margin: 0; white-space: normal; font-size: var(--font-size-xs); line-height: 1.5; }
</style>
