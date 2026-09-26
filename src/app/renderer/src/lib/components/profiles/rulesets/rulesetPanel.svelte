<script lang="ts">
  import { onDestroy, onMount } from 'svelte'
  import { unsavedChanges } from '$lib/utils/unsavedChanges'
  import { applyRulesetDraft, saveRulesetDraft } from './rulesetEditor'
  import type { Ruleset, RulesetRule, RuleDefinition } from '@spellbook/shared/rulesets/rulesetTypes'
  import type { ServerProfileAction } from '$lib/core'
  import { actionsApi } from '$lib/utils/actionsApi'
  import RuleEditor from './ruleEditor.svelte'
  import RuleCard from './ruleCard.svelte'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import InfoNotice from '$lib/components/ui/infoNotice.svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import type { FormOption } from '$lib/types/ui'
  import Toggle from '$lib/components/ui/Toggle.svelte'
  import { timezone, loadTimezone } from '$lib/settings/timezone'
  export let profileId: number
  export let actions: ServerProfileAction[]
  export let previewServers: FormOption[]
  export let disabled = false
  export let isDefault = false
  export let onCounts: (active: number, total: number) => void = () => {}
  let ruleset: Ruleset | null = null
  let definitions: RuleDefinition[] = []
  let error = ``
  let timezoneReady = false
  let timezoneError = ``
  let dateError = ``
  $: zone = timezoneReady ? $timezone : null
  export let saving = false
  let serverId = ``
  let preview: unknown = null
  $: if (!previewServers.some(server => server.value === serverId)) {
    serverId = previewServers.length === 1 ? previewServers[0].value : ``
    preview = null
  }
  let draft: RulesetRule | null = null
  let selectedIndex = -1
  let saved: Ruleset | null = null
  let draggedIndex: number | null = null
  export function isDirty() {
    return Boolean(dateError || draft && (selectedIndex === -1 || JSON.stringify(draft) !== JSON.stringify(ruleset?.rules[selectedIndex]))
      || ruleset && saved && JSON.stringify(ruleset) !== JSON.stringify(saved))
  }
  onDestroy(unsavedChanges.register(isDirty))
  function reorder(from: number, to: number) {
    if (!ruleset || locked || from === to || to < 0 || to >= ruleset.rules.length) return
    const rules = [...ruleset.rules]
    const [rule] = rules.splice(from, 1)
    rules.splice(to, 0, rule)
    ruleset = { ...ruleset, rules }
  }
  function startDrag(event: DragEvent, index: number) {
    if (locked) { event.preventDefault(); return }
    draggedIndex = index
    if (event.dataTransfer) { event.dataTransfer.effectAllowed = `move`; event.dataTransfer.setData(`text/plain`, String(index)) }
  }
  function drop(index: number) {
    if (draggedIndex !== null) void reorder(draggedIndex, index)
    draggedIndex = null
  }
  $: locked = disabled || saving || isDefault || ruleset?.paused
  $: activeCount = ruleset?.enabled ? ruleset.rules.filter(rule => rule.enabled).length : 0
  $: if (ruleset) onCounts(activeCount, ruleset.rules.length)
  function edit(index: number) {
    if (!ruleset || locked) return
    selectedIndex = index
    draft = structuredClone(ruleset.rules[index])
    preview = null
  }
  export function back(): boolean {
    if (!draft || !ruleset || locked) return false
    try { validate() } catch (value) { error = String(value); return true }
    ruleset = applyRulesetDraft(ruleset, draft, selectedIndex)
    closeRule()
    return true
  }
  function closeRule() {
    draft = null
    dateError = ``
    preview = null
  }
  function remove(index: number) {
    if (ruleset && !locked) ruleset.rules = ruleset.rules.filter((_, i) => i !== index)
  }
  async function evaluate(ruleId: number) {
    try { preview = await actionsApi(`previewRule`, { id: profileId, ruleId, gameServerId: Number(serverId) }); error = `` }
    catch (value) { error = String(value) }
  }
  onMount(() => { void load(); void loadZone() })
  async function loadZone() {
    timezoneError = ``
    try { await loadTimezone(); timezoneReady = true }
    catch (value) { timezoneError = String(value) }
  }
  export function validate() {
    if (dateError) throw new Error(dateError)
    if (draft?.condition.mode === `if`) {
      const key = draft.condition.definition
      const type = definitions.find(item => item.key === key)?.valueType
      if ((type === `date` || type === `time`) && !zone) throw new Error(`Load your timezone before editing date and time conditions.`)
    }
  }
  async function load() {
    try { [ruleset, definitions] = await Promise.all([actionsApi<Ruleset>(`ruleset`, { id: profileId }), actionsApi<RuleDefinition[]>(`definitions`)]); saved = structuredClone(ruleset) }
    catch (value) { error = String(value) }
  }
  function withEnabled(value: Ruleset, enabled: boolean, ruleId?: number): Ruleset {
    return ruleId === undefined ? { ...value, enabled } : {
      ...value, rules: value.rules.map(rule => rule.id === ruleId ? { ...rule, enabled } : rule)
    }
  }
  function setEnabled(enabled: boolean, ruleId?: number) {
    if (!ruleset || locked) return
    ruleset = withEnabled(ruleset, enabled, ruleId)
  }
  export async function save() {
    if (!ruleset) throw new Error(`Wait for the ruleset to load before saving.`)
    if (saving) throw new Error(`The ruleset is already saving.`)
    if (isDefault || ruleset.paused) return
    validate()
    saving = true
    try {
      ruleset = await saveRulesetDraft(ruleset, draft, selectedIndex, next =>
        actionsApi<Ruleset>(`saveRuleset`, { id: profileId, enabled: next.enabled, rules: next.rules }))
      saved = structuredClone(ruleset)
      closeRule()
      error = ``
    } catch (value) {
      error = String(value)
      throw value
    } finally { saving = false }
  }
  function add() {
    if (!ruleset || locked) return
    selectedIndex = -1
    preview = null
    draft = { id: 0, rulesetId: ruleset.id, name: `New rule`, description: ``, enabled: false,
      actionKey: actions.find(action => action.actionDomain === `player`)?.actionKey ?? ``, priority: `normal`, freshnessSeconds: 60,
      condition: { mode: `if`, definition: `Player.rank`, operator: `<`, value: 50, triggerOnce: true }, revision: 1 }
  }
</script>

<div class="ruleset-panel">
  {#if error}<p role="alert">{error}</p>{/if}
  {#if timezoneError}
    <p role="alert">{timezoneError}</p>
    <Button label="Retry timezone" onClick={() => { void loadZone() }} />
  {/if}
  {#if ruleset?.paused}
    <InfoNotice message="Ruleset is disabled" />
  {:else if ruleset}
    {#if isDefault}<p class="ruleset-panel__warning" role="status">Rulesets cannot be activated on the Default profile.</p>
    {:else if !ruleset.enabled}<p class="ruleset-panel__warning" role="status">This ruleset is disabled. Enable it to run its active rules.</p>{/if}
    {#if draft}
      <PanelHeader variant="section" eyebrow="Ruleset / Rule" title={draft.name || `New rule`} />
      <RuleCard rule={draft} {definitions} {actions} {zone} disabled={locked} onToggle={value => { if (draft) draft.enabled = value }} />
      <RuleEditor bind:rule={draft} {definitions} {actions} {zone} bind:dateError disabled={locked} />
      {#if draft.id}
        <section class="ruleset-panel__preview">
          <PanelHeader variant="section" title="Test saved rule" />
          <Select label="Server" searchable value={serverId} options={previewServers} placeholder="Choose a server"
            disabled={locked || previewServers.length === 0} onChange={value => { serverId = value; preview = null }} />
          {#if previewServers.length === 0}<p>No servers are available to preview this profile?s rules.</p>{/if}
          <Button label="Preview saved rule" disabled={locked || !serverId} onClick={() => { if (draft) void evaluate(draft.id) }} />
          {#if preview}<pre>{JSON.stringify(preview, null, 2)}</pre>{/if}
        </section>
      {/if}
    {:else}
      <PanelHeader variant="section" title="Ruleset">
        <svelte:fragment slot="trailing">
          <Toggle label={ruleset.enabled ? `Enabled` : `Disabled`} checked={ruleset.enabled}
            disabled={locked} onChange={value => setEnabled(value)} />
        </svelte:fragment>
      </PanelHeader>
      <div class="ruleset-panel__stats">
        {#each [{ label: `Active`, value: activeCount, icon: `fa-circle`, tone: `var(--color-accent-secondary)` }, { label: `Disabled`, value: ruleset.rules.length - activeCount, icon: `fa-circle`, tone: `var(--color-accent-tertiary)` }, { label: `Total rules`, value: ruleset.rules.length, icon: `fa-layer-group`, tone: `var(--color-accent-primary)` }] as stat}
          <div class="ruleset-panel__stat">
            <span class="ruleset-panel__stat-icon" style:color={stat.tone}><Icon name={stat.icon} /></span>
            <span><strong>{stat.value}</strong><small>{stat.label}</small></span>
          </div>
        {/each}
      </div>
      <PanelHeader variant="section" title="Rules">
        <svelte:fragment slot="trailing"><Button label="New rule" icon="fa-plus" disabled={locked} onClick={add} /></svelte:fragment>
      </PanelHeader>
      <div class="ruleset-panel__rules">
        {#each ruleset.rules as rule, index}
          <RuleCard {rule} {definitions} {actions} {zone} disabled={locked} onOpen={() => edit(index)}
            onToggle={value => void setEnabled(value, rule.id)} onRemove={() => remove(index)} onDragStart={event => startDrag(event, index)} onDrop={() => drop(index)}
            onDragEnd={() => draggedIndex = null} dragging={draggedIndex === index}
            onMove={direction => reorder(index, index + direction)} canMoveUp={index > 0} canMoveDown={index < ruleset.rules.length - 1} />
        {:else}
          <EmptyState title="No rules yet" message="Add a rule to choose when an action should run." />
        {/each}
      </div>
    {/if}
  {:else}
    <p>Loading ruleset?</p>
  {/if}
</div>

<style lang="scss">
  .ruleset-panel__warning { padding: var(--gutter-md); border: 1px solid var(--color-accent-tertiary); border-radius: var(--radius); }
  .ruleset-panel, .ruleset-panel__rules, .ruleset-panel__preview { display: grid; gap: var(--gutter-lg); min-width: 0; }
  .ruleset-panel__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gutter-sm); }
  .ruleset-panel__stat { display: flex; align-items: center; gap: var(--gutter-md); padding: var(--gutter-md); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); }
  .ruleset-panel__stat > span:last-child { display: grid; gap: var(--gutter-sm); }
  .ruleset-panel__stat small { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  .ruleset-panel__stat-icon { display: grid; place-items: center; padding: var(--gutter-sm); border-radius: var(--radius); background: rgbaa(var(--color-dark-tertiary), 0.5); }
  .ruleset-panel__preview { border-top: 1px solid var(--color-dark-tertiary); padding-top: var(--gutter-lg); }
  pre { min-width: 0; max-height: 280px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: var(--font-size-xs); }
  p { margin: 0; }
</style>
