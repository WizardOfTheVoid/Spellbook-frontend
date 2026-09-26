<script lang="ts">
  import type { RulesetRule, RuleDefinition, RuleOperator } from '@spellbook/shared/rulesets/rulesetTypes'
  import type { ServerProfileAction } from '$lib/core'
  import { profileActionIcon, profileActionIconColor } from '$lib/utils/profileActions'
  import Icon from '$lib/components/ui/Icon.svelte'
  import Toggle from '$lib/components/ui/Toggle.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import { openInfinityMenu } from '$lib/components/ui/infinityMenu'
  import { formatActionTime } from '$lib/settings/timezone'
  import { ruleClockBounds, ruleClockInput } from './ruleDateInput'

  export let rule: RulesetRule
  export let definitions: RuleDefinition[]
  export let actions: ServerProfileAction[]
  export let disabled = false
  export let zone: string | null = null
  const referenceDate = new Date().toISOString().slice(0, 10)
  export let onOpen: (() => void) | null = null
  export let onToggle: (value: boolean) => void
  export let onRemove: (() => void) | null = null

  export let onDragStart: ((event: DragEvent) => void) | null = null
  export let onDrop: (() => void) | null = null
  export let onDragEnd: (() => void) | null = null
  export let onMove: ((direction: number) => void) | null = null
  export let dragging = false
  export let canMoveUp = false
  export let canMoveDown = false
  function menu(event: MouseEvent) {
    if (!onOpen || !onRemove) return
    event.preventDefault()
    event.stopPropagation()
    openInfinityMenu({ name: rule.name, icon: `fa-bolt`, items: [
      { name: `Edit rule`, icon: `fa-pen`, action: onOpen },
      { name: rule.enabled ? `Disable rule` : `Enable rule`, icon: `fa-power-off`, disabled, action: () => onToggle(!rule.enabled) },
      { name: `Move up`, icon: `fa-arrow-up`, disabled: disabled || !canMoveUp, action: () => onMove?.(-1) },
      { name: `Move down`, icon: `fa-arrow-down`, disabled: disabled || !canMoveDown, action: () => onMove?.(1) },
      { name: `Remove rule`, icon: `fa-trash`, disabled, action: onRemove }
    ] }, { x: event.clientX, y: event.clientY }, event.currentTarget as HTMLElement)
  }

  const comparisons: Record<RuleOperator, string> = {
    '=': `is`, '!=': `is not`, '<': `is less than`, '<=': `is at most`, '>': `is greater than`, '>=': `is at least`
  }
  $: action = actions.find(item => item.actionKey === rule.actionKey)
  $: icon = action ? profileActionIcon(action) : { name: `fa-bolt`, type: `light` as const }
  $: tone = action ? profileActionIconColor(action) : `var(--color-light-secondary)`
  $: condition = rule.condition
  $: definition = condition.mode === `if` ? definitions.find(item => condition.mode === `if` && item.key === condition.definition) : null
  function displayValue(value: string | number, type: RuleDefinition[`valueType`] | undefined, zone: string | null) {
    if (type !== `date` && type !== `time`) return String(value)
    if (!value) return `Choose ${type === `date` ? `date and time` : `time`}`
    if (!zone) return `Loading timezone…`
    try { return `${type === `date` ? formatActionTime(String(value), zone) : ruleClockInput(String(value), zone, referenceDate)} (${zone})` }
    catch { return `Invalid ${type}` }
  }
  $: clockBounds = zone && definition?.valueType === `time` ? ruleClockBounds(zone, referenceDate) : null
  $: tokens = condition.mode === `each`
    ? [`Every`, String(condition.amount), `${condition.unit}${condition.amount === 1 ? `` : `s`}`]
    : [`If`, definition?.label ?? condition.definition, comparisons[condition.operator], `${displayValue(condition.value, definition?.valueType, zone)}${definition?.unit ? ` ${definition.unit}` : ``}`]
</script>

<article class="rule-card" class:rule-card--disabled={!rule.enabled} class:rule-card--dragging={dragging}
  draggable={Boolean(onDragStart) && !disabled} on:contextmenu={menu}
  on:dragstart={event => onDragStart?.(event)} on:dragend={() => onDragEnd?.()}
  on:dragover={event => { if (onDrop && !disabled) event.preventDefault() }}
  on:drop={event => { if (onDrop && !disabled) { event.preventDefault(); onDrop() } }}>
  {#snippet content()}
    <Icon name={icon.name} type={icon.type} {tone} />
    <span class="rule-card__copy">
      <strong>{rule.name}</strong>
      {#if rule.description}<span class="rule-card__description">{rule.description}</span>{/if}
      <span class="rule-card__tokens">{#each tokens as token}<span class="rule-card__token">{token}</span>{/each}</span>
      {#if clockBounds}<span class="rule-card__description">UTC day: {clockBounds.start}–{clockBounds.end} in {zone} (shown for {referenceDate}).</span>{/if}
      <span class="rule-card__tokens"><span class="rule-card__token">THEN</span><span class="rule-card__token" style:color={tone}><Icon name={icon.name} type={icon.type} size="sm" />{action?.label ?? `Choose an action`}</span></span>
    </span>
  {/snippet}
  {#if onOpen}
    <button class="rule-card__content" type="button" on:click={onOpen} aria-label={`Edit ${rule.name}`}>
      {@render content()}
    </button>
  {:else}
    <div class="rule-card__content">{@render content()}</div>
  {/if}
  <div class="rule-card__controls">
    {#if onOpen && onRemove}
      <IconButton icon="fa-ellipsis-vertical" ariaLabel={`Actions for ${rule.name}`} size="sm" onClick={menu} />
    {/if}
    <Toggle label={`Enable ${rule.name}`} showLabel={false} checked={rule.enabled} {disabled} onChange={onToggle} />
  </div>
</article>

<style lang="scss">
  .rule-card {
    display: flex;
    align-items: center;
    gap: var(--gutter-md);
    border: 1px solid var(--color-dark-tertiary);
    border-radius: var(--radius);
    background: rgbaa(var(--color-dark-primary), 0.5);
    padding: var(--gutter-md);
    min-width: 0;
  }
  .rule-card--dragging { opacity: 0.4; }
  .rule-card__content {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--gutter-lg);
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--color-light-primary);
    text-align: left;
    font: inherit;
  }
  button.rule-card__content { cursor: pointer; }
  button.rule-card__content:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 5px; }
  .rule-card__copy { display: grid; min-width: 0; gap: var(--gutter-sm); overflow-wrap: anywhere; }
  .rule-card__description { color: var(--color-light-secondary); font-size: var(--font-size-sm); }
  .rule-card__tokens, .rule-card__controls { display: flex; align-items: center; gap: var(--gutter-sm); }
  .rule-card__tokens { flex-wrap: wrap; }
  .rule-card__token { display: inline-flex; align-items: center; gap: var(--gutter-sm); padding: 2px 6px; border: 1px solid var(--color-dark-tertiary); border-radius: 4px; font-size: var(--font-size-xs); color: var(--color-light-secondary); }
  .rule-card--disabled .rule-card__content { opacity: 0.5; }
</style>
