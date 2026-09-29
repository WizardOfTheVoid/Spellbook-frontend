<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { DatePicker } from '@svelte-plugins/datepicker'
  import { createControlId } from '$lib/utils/controlIds'
  import { tooltip as tooltipAction } from '$lib/utils/tooltip'
  import Icon from './Icon.svelte'
  import { datePickerOverlayPosition, enabledPickerDates, formatPickerDate, pickerDate, pickerRangeLabels, pickerValue, withinPickerBounds } from './datePickerValues'

  export let value = ``
  export let endValue = ``
  export let type: `date` | `datetime-local` | `time` = `date`
  export let range = false
  export let presets: { label: string, start: number | null, end: number | null }[] | (() => { label: string, start: number | null, end: number | null }[]) = []
  export let step: number | null = null
  export let label: string
  export let id: string | null = null
  export let hint: string | null = null
  export let tooltip: string | null = null
  export let min: string | null = null
  export let max: string | null = null
  export let maxToday = false
  export let disabled = false
  export let required = false
  export let onChange: ((value: string) => void) | null = null
  export let onRangeChange: ((start: number | null, end: number | null) => void) | null = null

  const generatedId = createControlId(`date`)
  let open = false
  let root: HTMLDivElement
  let trigger: HTMLButtonElement
  let pickerLeft = 0
  let pickerTop = 0
  let selectedStart: Date | number | null = pickerDate(value)
  let selectedEnd: Date | number | null = pickerDate(endValue)
  let selectedTime = value.slice(11, 16) || `00:00`
  let lastValue = value
  let lastEndValue = endValue
  let currentPresets = typeof presets === `function` ? presets() : presets
  let currentMax = maxToday ? pickerValue(new Date()) : max

  onMount(() => {
    window.addEventListener(`scroll`, positionPicker, true)
    return () => window.removeEventListener(`scroll`, positionPicker, true)
  })

  $: controlId = id ?? generatedId
  $: if (value !== lastValue || endValue !== lastEndValue) {
    lastValue = value
    lastEndValue = endValue
    selectedStart = pickerDate(value)
    selectedEnd = pickerDate(endValue)
    selectedTime = value.slice(11, 16) || `00:00`
  }
  $: if (disabled && open) open = false
  $: enabledDates = min && currentMax ? enabledPickerDates(min, currentMax) : []
  $: if (range && !selectedStart && !selectedEnd && (value || endValue) &&
    currentPresets.some(({ start, end }) => start === null && end === null)) onRangeChange?.(null, null)
  $: rangeLabels = pickerRangeLabels(value, endValue)
  $: displayValue = range
    ? value ? `From ${formatPickerDate(value)}` : endValue ? `Until ${formatPickerDate(endValue)}` : `All time`
    : value ? formatPickerDate(value) : `Select date`

  function picked(event: { startDate?: number, endDate?: number }): void {
    if (range) {
      if (event.startDate && event.endDate) {
        const start = pickerValue(event.startDate)
        const end = pickerValue(event.endDate)
        if (withinPickerBounds(start, min, currentMax) && withinPickerBounds(end, min, currentMax)) {
          onRangeChange?.(event.startDate, event.endDate)
        } else {
          selectedStart = pickerDate(value)
          selectedEnd = pickerDate(endValue)
          open = true
        }
      }
      return
    }
    const next = pickerValue(event.startDate ?? null, type === `datetime-local` ? selectedTime : null)
    if (!withinPickerBounds(next, min, currentMax)) {
      selectedStart = pickerDate(value)
      open = true
      return
    }
    onChange?.(next)
    trigger?.focus()
  }

  function changeTime(event: Event): void {
    selectedTime = (event.currentTarget as HTMLInputElement).value
    if (value && selectedTime) onChange?.(pickerValue(pickerDate(value), selectedTime))
  }

  function clear(): void {
    selectedStart = null
    selectedEnd = null
    open = false
    onChange?.(``)
    trigger?.focus()
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (open && event.key === `Escape`) {
      open = false
      trigger?.focus()
    }
  }

  function positionPicker(): void {
    if (!open || !trigger || !root) return
    const popup = root.querySelector<HTMLElement>(`.calendars-container`)
    if (!popup) return
    const position = datePickerOverlayPosition(trigger.getBoundingClientRect(),
      { width: popup.offsetWidth, height: popup.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight })
    pickerLeft = position.x
    pickerTop = position.y
  }

  async function toggle(): Promise<void> {
    if (!open) {
      currentPresets = typeof presets === `function` ? presets() : presets
      currentMax = maxToday ? pickerValue(new Date()) : max
    }
    open = !open
    if (open) {
      await tick()
      positionPicker()
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} on:resize={positionPicker} />

<div class="ui-date-input" bind:this={root} style={`--datepicker-container-left: ${pickerLeft}px; --datepicker-container-top: ${pickerTop}px;`} use:tooltipAction={tooltip ?? ``}>
  <label id={`${controlId}-label`} for={controlId}>{label}</label>
  {#if type === `time`}
    <input id={controlId} type="time" {value} step={step ?? undefined} min={min ?? undefined}
      max={max ?? undefined} {disabled} {required}
      on:input={(event) => onChange?.(event.currentTarget.value)} />
  {:else}
    <DatePicker bind:isOpen={open} bind:startDate={selectedStart} bind:endDate={selectedEnd}
      align="left" startOfWeek={1}
      isRange={range} showPresets={range && currentPresets.length > 0} presetRanges={currentPresets}
      {enabledDates} enableFutureDates={!maxToday} includeFont={false} onDateChange={picked}>
      <div class="ui-date-input__control">
        <button bind:this={trigger} id={controlId} type="button" class="ui-date-input__trigger"
          aria-labelledby={`${controlId}-label ${controlId}-value`} aria-expanded={open} {disabled}
          on:click={toggle}>
          <span id={`${controlId}-value`} class="ui-date-input__value">
            {#if range && value && endValue}
              {rangeLabels.start}<span class="ui-date-input__separator">–</span>{rangeLabels.end}
            {:else}
              {displayValue}
            {/if}
          </span>
          <span aria-hidden="true"><Icon name="fa-calendar" size="sm" /></span>
        </button>
        {#if type === `datetime-local`}
          <input class="ui-date-input__time" type="time" value={selectedTime} step={step ?? undefined}
            aria-label={`${label} time`} {disabled} on:input={changeTime} />
        {/if}
        {#if !range && value}
          <button class="ui-date-input__clear" type="button" aria-label="Clear date"
            {disabled} on:click={clear}>Clear</button>
        {/if}
      </div>
    </DatePicker>
  {/if}
  {#if hint}<small>{hint}</small>{/if}
</div>

<style lang="scss">
  .ui-date-input {
    min-width: 0;
    display: grid;
    gap: var(--gutter-sm);
    color: var(--color-light-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight);
    --datepicker-font-weight-base: var(--font-weight);
    --datepicker-font-weight-medium: var(--font-weight);
    --datepicker-calendar-header-text-font-weight: var(--font-weight);
    --datepicker-calendar-dow-font-weight: var(--font-weight);
    --datepicker-calendar-today-font-weight: var(--font-weight);
    --datepicker-calendar-range-selected-font-weight: var(--font-weight-medium);
    --datepicker-border-color: var(--color-dark-tertiary);
    --datepicker-color: var(--color-light-primary);
    --datepicker-font-family: var(--font-family-base);
    --datepicker-state-active: var(--color-accent-primary);
    --datepicker-state-hover: var(--color-dark-tertiary);
    --datepicker-container-background: var(--color-dark-primary);
    --datepicker-container-border: 1px solid var(--color-dark-tertiary);
    --datepicker-container-border-radius: var(--radius);
    --datepicker-container-box-shadow: var(--shadow);
    --datepicker-container-position: fixed;
    --datepicker-container-zindex: calc(var(--z-popover) + 10);
    --datepicker-calendar-header-color: var(--color-light-primary);
    --datepicker-calendar-header-text-color: var(--color-light-primary);
    --datepicker-calendar-header-month-nav-background-hover: var(--color-dark-tertiary);
    --datepicker-calendar-header-month-nav-icon-next-filter: invert(1);
    --datepicker-calendar-header-month-nav-icon-prev-filter: invert(1);
    --datepicker-calendar-header-year-nav-icon-next-filter: invert(1);
    --datepicker-calendar-header-year-nav-icon-prev-filter: invert(1);
    --datepicker-calendar-day-color: var(--color-light-primary);
    --datepicker-calendar-day-color-hover: var(--color-light-primary);
    --datepicker-calendar-day-background-hover: var(--color-dark-tertiary);
    --datepicker-calendar-day-other-color: var(--color-light-tertiary);
    --datepicker-calendar-day-color-disabled: var(--color-light-tertiary);
    --datepicker-calendar-dow-color: var(--color-light-tertiary);
    --datepicker-calendar-today-border: 1px solid var(--color-accent-primary);
    --datepicker-calendar-range-background: var(--color-dark-tertiary);
    --datepicker-calendar-range-color: var(--color-light-primary);
    --datepicker-calendar-range-start-end-background: var(--color-accent-primary);
    --datepicker-calendar-range-start-end-color: var(--color-light-primary);
    --datepicker-calendar-range-included-background: var(--color-dark-tertiary);
    --datepicker-calendar-range-included-box-shadow: inset 20px 0 0 var(--color-dark-tertiary);
    --datepicker-calendar-range-included-color: var(--color-light-primary);
    --datepicker-presets-border: 1px solid var(--color-dark-tertiary);
    --datepicker-presets-button-color: var(--color-light-primary);
    --datepicker-presets-button-color-hover: var(--color-light-primary);
    --datepicker-presets-button-background-hover: var(--color-dark-tertiary);
    --datepicker-presets-button-background-active: var(--color-accent-primary);
    --datepicker-presets-padding: var(--gutter-sm);
    --datepicker-presets-minwidth: calc(var(--gutter-md) * 8);
    --datepicker-presets-maxwidth: calc(var(--gutter-md) * 8);
    --datepicker-presets-button-padding: var(--gutter-sm);
    --datepicker-presets-button-margin: calc(var(--gutter-sm) / 4) 0;
    --datepicker-presets-button-font-size: var(--font-size-xs);
    --datepicker-calendar-width: calc(var(--gutter-md) * 17);
    --datepicker-calendar-padding: var(--gutter-sm) var(--gutter-md) var(--gutter-md);
    --datepicker-calendar-header-padding: var(--gutter-sm) calc(var(--gutter-sm) / 2);
    --datepicker-calendar-header-font-size: var(--font-size-md);
    --datepicker-calendar-dow-margin-bottom: var(--gutter-sm);
    --datepicker-calendar-day-width: calc(var(--gutter-md) * 2);
    --datepicker-calendar-day-height: calc(var(--gutter-md) * 2);
    --datepicker-calendar-day-padding: 0;
    --datepicker-calendar-range-selected-background: var(--color-accent-primary);
    --datepicker-calendar-range-start-box-shadow: inset calc(0px - var(--gutter-md)) 0 0 var(--color-dark-tertiary);
    --datepicker-calendar-range-end-box-shadow: inset var(--gutter-md) 0 0 var(--color-dark-tertiary);
    --datepicker-calendar-range-start-box-shadow-selected: inset calc(0px - var(--gutter-md)) 0 0 var(--color-dark-tertiary);
    --datepicker-calendar-range-end-box-shadow-selected: inset var(--gutter-md) 0 0 var(--color-dark-tertiary);
    --datepicker-calendar-range-included-box-shadow: inset var(--gutter-md) 0 0 var(--color-dark-tertiary);
  }

  .ui-date-input__control { display: flex; min-width: 0; }
  .ui-date-input :global(.datepicker .calendars-container) { max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); overflow: auto; }
  .ui-date-input__trigger, .ui-date-input__clear, input {
    height: var(--control-height-md);
    box-sizing: border-box;
    border: 1px solid var(--color-dark-secondary);
    border-radius: var(--radius);
    padding: 0 var(--gutter-md);
    color: var(--color-light-primary);
    background: transparent;
    font: inherit;
    outline: none;
  }
  .ui-date-input__trigger { display: flex; flex: 1; min-width: 0; align-items: center; justify-content: space-between; gap: var(--gutter-sm); text-align: left; cursor: pointer; }
  .ui-date-input__value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ui-date-input__separator { margin-inline: var(--gutter-sm); color: var(--color-light-tertiary); }
  .ui-date-input__time { width: calc(var(--gutter-md) * 6); margin-left: var(--gutter-sm); color-scheme: dark; }
  .ui-date-input__clear { margin-left: var(--gutter-sm); white-space: nowrap; cursor: pointer; }
  input { width: 100%; min-width: 0; color-scheme: dark; }
  .ui-date-input__trigger:focus-visible, .ui-date-input__clear:focus-visible, input:focus { border-color: var(--color-accent-primary); }
  button:disabled, input:disabled { cursor: not-allowed; opacity: 0.5; }
  small { color: var(--color-light-tertiary); font-weight: var(--font-weight); }

  @media (max-width: 600px) {
    .ui-date-input :global(.datepicker .calendars-container.presets .calendar-presets:not(.presets-only)) {
      display: flex;
      flex-flow: row wrap;
      padding: var(--gutter-sm);
    }
  }
</style>
