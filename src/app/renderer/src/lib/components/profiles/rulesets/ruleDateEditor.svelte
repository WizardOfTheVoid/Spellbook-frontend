<script lang="ts">
  import DateInput from '$lib/components/ui/DateInput.svelte'
  import { ruleClockBounds, ruleClockInput, ruleClockValue, ruleDateInput, ruleDateValue, repeatedRuleDate, repeatedRuleClock } from './ruleDateInput'

  export let kind: `date` | `time`
  export let value: string
  export let zone: string | null
  export let disabled = false
  export let error = ``
  export let onChange: (value: string) => void
  const referenceDate = new Date().toISOString().slice(0, 10)
  let input = ``
  let lastValue: string | undefined
  let lastZone: string | null | undefined
  let repeated = false

  $: if (value !== lastValue || zone !== lastZone) {
    lastValue = value
    lastZone = zone
    error = ``
    repeated = false
    try {
      input = !zone ? `` : kind === `date` ? ruleDateInput(value, zone) : ruleClockInput(value, zone, referenceDate)
      repeated = Boolean(zone && (kind === `date` ? repeatedRuleDate(input, zone) : repeatedRuleClock(input, zone, referenceDate)))
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
  }

  $: bounds = zone && kind === `time` ? ruleClockBounds(zone, referenceDate) : null
  $: scheduleHint = !zone ? `Loading your timezone…` : bounds
    ? `UTC day: ${bounds.start}–${bounds.end} in ${zone} (shown for ${referenceDate}). Local times can shift with daylight saving.`
    : ``
  $: hint = [scheduleHint, repeated ? `This hour occurs twice. An unchanged saved time is preserved; new selections use the first occurrence.` : ``].filter(Boolean).join(` `) || null

  function change(next: string) {
    if (!zone) return
    input = next
    error = ``
    try {
      const saved = kind === `date` ? ruleDateValue(next, zone, value) : ruleClockValue(next, zone, referenceDate, value)
      repeated = kind === `date` ? repeatedRuleDate(next, zone) : repeatedRuleClock(next, zone, referenceDate)
      lastValue = saved
      onChange(saved)
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason) }
  }
</script>

<div>
  <DateInput type={kind === `date` ? `datetime-local` : `time`} step={60}
    label={`${kind === `date` ? `Date and time` : `Time`}${zone ? ` (${zone})` : ``}`}
    value={input} disabled={disabled || !zone} {hint} onChange={change} />
  {#if error}<p role="alert">{error}</p>{/if}
</div>
