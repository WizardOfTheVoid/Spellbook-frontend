<script lang="ts">
  import { onDestroy, untrack } from 'svelte'
  import { Tween, prefersReducedMotion } from 'svelte/motion'
  import { dataChange } from '$lib/utils/dataChange'
  import { cssDuration } from '$lib/utils/cssDuration'
  let element: HTMLSpanElement
  let { value, formatValue = (number: number | null) => number === null ? `—` : number.toLocaleString(`en-US`) }: { value: number | null, formatValue?: (value: number | null) => string } = $props()
  const tween = new Tween(untrack(() => value ?? 0))
  let previous = untrack(() => value)
  $effect(() => {
    const next = value
    const reduced = prefersReducedMotion.current
    if (next === previous && !reduced) return
    const instant = previous === null || next === null || reduced
    previous = next
    untrack(() => void tween.set(next ?? 0, { duration: instant ? 0 : cssDuration(getComputedStyle(element), `--motion-base`) }))
  })
  onDestroy(() => { void tween.set(tween.current, { duration: 0 }) })
</script>

<span class="animated-number" bind:this={element} use:dataChange={value}><span aria-hidden="true">{formatValue(value === null ? null : Math.round(tween.current))}</span><span class="accessible-value">{formatValue(value)}</span></span>

<style>
  .animated-number { font-variant-numeric: tabular-nums; }
  .accessible-value { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
