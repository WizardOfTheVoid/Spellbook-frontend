<script lang="ts">
  export let value: number | null = null
  export let max = 100
  export let label: string

  $: percent = value === null || max <= 0 ? null : Math.max(0, Math.min(100, value / max * 100))
</script>

<div class="progress-bar" class:progress-bar--indeterminate={percent === null} role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent ?? undefined}>
  <span style:width={percent === null ? `32%` : `${percent}%`}></span>
</div>

<style lang="scss">
  .progress-bar { height: 8px; width: 100%; overflow: hidden; border-radius: 999px; background: var(--color-dark-secondary); }
  span { display: block; height: 100%; border-radius: inherit; background: var(--color-accent-primary); transition: width 200ms ease; }
  .progress-bar--indeterminate span { animation: progress-slide 1.4s ease-in-out infinite; }
  @keyframes progress-slide { from { transform: translateX(-100%); } to { transform: translateX(315%); } }
  @media (prefers-reduced-motion: reduce) { span { transition: none; } .progress-bar--indeterminate span { animation: none; } }
</style>
