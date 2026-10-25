<script lang="ts">
  import { onMount } from 'svelte'
  import { actionEventsLimits, actionEventTypes } from '@spellbook/shared/actionEvents'
  import { containModalTab } from '$lib/utils/quickActionUi'
  import Icon from '../ui/Icon.svelte'
  import Tag from '../ui/Tag.svelte'
  import MultiSelect from '../ui/MultiSelect.svelte'
  import DateInput from '../ui/DateInput.svelte'
  import { pickerValue } from '../ui/datePickerValues'
  import { actionEventsDateBounds, actionEventsDatePresets, actionEventsTeamIds, actionEventsAdmins,
    setActionEventsTeams, setActionEventsAdmins, selectActionEventsTeams } from './actionEventsQuery'
  import type { ActionEventsCatalog, ActionEventsQuery } from './actionEventsTypes'

  export let query: ActionEventsQuery
  export let catalog: ActionEventsCatalog
  export let trigger: HTMLButtonElement | undefined
  export let onChange: (query: ActionEventsQuery) => void
  export let onClose: () => void
  export let onReset: () => void
  export let canReset: boolean

  const typeNames = { ban: `Ban`, unban: `Unban`, kick: `Kick`, warn: `Warn`, server_message: `ServerSay`, admin_message: `AdminSay` }
  let teamSelect: MultiSelect
  $: teamIds = actionEventsTeamIds(query.teams, catalog)
  $: admins = actionEventsAdmins(query.teams, catalog)
  $: teamSummary = query.teams.mode === `selected` ? `${teamIds.length} team${teamIds.length === 1 ? `` : `s`}` : `All teams`
  let dialog: HTMLDivElement
  let root: HTMLDivElement
  let closeButton: HTMLButtonElement
  let closing = false
  let top = 0

  function allTeams(): void {
    onChange(setActionEventsTeams(query, { mode: `all`, ids: [] }, catalog))
    teamSelect.close()
  }

  function close(): void {
    if (closing) return
    closing = true
    if (typeof SFX !== `undefined`) SFX.play(`close`)
    onClose()
  }

  onMount(() => {
    top = trigger ? trigger.getBoundingClientRect().bottom - root.getBoundingClientRect().top : 0
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      if (event.key === `Escape`) { event.preventDefault()
        close() }
      containModalTab(event, dialog, document.activeElement)
    }
    const outside = (event: PointerEvent) => {
      if (!dialog.contains(event.target as Node) && !trigger?.contains(event.target as Node)) close()
    }
    window.addEventListener(`keydown`, keydown)
    window.addEventListener(`pointerdown`, outside, true)
    closeButton.focus()
    return () => {
      window.removeEventListener(`keydown`, keydown)
      window.removeEventListener(`pointerdown`, outside, true)
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  })
</script>

<div bind:this={root} class="action-events-filter-modal" style={`--filters-top: ${top}px`}>
  <button type="button" class="action-events-filter-modal__backdrop" aria-label="Close filters" tabindex="-1" data-uisfx-ignore="true" on:click={close}></button>
  <div id="action-events-filters-dialog" bind:this={dialog} class="action-events-filter-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="action-events-filters-title" tabindex="-1">
    <header><Icon name="fa-sliders" /><h2 id="action-events-filters-title">Filters</h2>
      <Tag label="Reset" icon="fa-rotate-left" compact disabled={!canReset} onClick={onReset} />
      <button bind:this={closeButton} type="button" aria-label="Close filters" data-uisfx-ignore="true" on:click={close}><Icon name="fa-xmark" /></button>
    </header>
    <div class="action-events-filter-modal__body">
      <MultiSelect bind:this={teamSelect} label="My teams" value={query.teams.mode === `selected` ? query.teams.ids.map(String) : []}
        options={catalog.teams.map(team => ({ value: `${team.id}`, label: team.name, group: `Individual teams` }))}
        compact floatingMenu selectionLabel={teamSummary} showSelectAll={false} maxSelections={actionEventsLimits.selections}
        onChange={ids => onChange(selectActionEventsTeams(query, ids.map(Number), catalog))}>
        <div slot="shortcuts" class="action-events-filter-modal__shortcuts">
          <button type="button" aria-pressed={query.teams.mode === `all`} on:click={allTeams}><Icon name="fa-users" size="sm" />All teams</button>
        </div>
      </MultiSelect>
      <MultiSelect label="Admins" value={query.admins.map(String)} options={admins.map(admin => ({ value: `${admin.id}`, label: admin.name }))}
        compact floatingMenu selectionLabel={query.admins.length ? `${query.admins.length} selected` : `All admins`} maxSelections={actionEventsLimits.selections}
        onChange={ids => onChange(setActionEventsAdmins(query, ids.map(Number)))} />
      <DateInput label="Date" range maxToday presets={() => actionEventsDatePresets(new Date())}
        value={query.since === null ? `` : pickerValue(new Date(query.since))}
        endValue={query.until === null ? `` : pickerValue(new Date(query.until - 1))}
        onRangeChange={(start, end) => onChange({ ...query, ...actionEventsDateBounds(start, end) })} />
      <MultiSelect label="Server" compact floatingMenu selectionLabel={query.servers.length ? `${query.servers.length} selected` : `All servers`}
        value={query.servers.map(String)} options={catalog.servers.map(server => ({ value: `${server.id}`, label: server.name }))}
        maxSelections={actionEventsLimits.selections} onChange={ids => onChange({ ...query, servers: ids.map(Number) })} />
      <MultiSelect label="Action type" compact floatingMenu selectionLabel={query.actionTypes.length ? `${query.actionTypes.length} selected` : `All actions`}
        value={query.actionTypes} options={actionEventTypes.map(value => ({ value, label: typeNames[value] }))}
        onChange={values => onChange({ ...query, actionTypes: values as ActionEventsQuery[`actionTypes`] })} />
    </div>
  </div>
</div>

<style lang="scss">
  .action-events-filter-modal { position: absolute; inset: 0; z-index: calc(var(--z-popover) + 2); display: grid; place-items: start center; padding: var(--gutter); padding-top: calc(var(--filters-top) + var(--gutter-md)); }
  .action-events-filter-modal__backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgbaa(var(--color-dark-primary), 0.25); }
  .action-events-filter-modal__dialog { position: relative; display: flex; flex-direction: column; min-height: 0; box-sizing: border-box; width: min(680px, 100%); max-height: 100%; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); background: var(--color-dark-primary); box-shadow: var(--shadow); }
  header { display: flex; flex-shrink: 0; align-items: center; gap: var(--gutter-md); padding: var(--gutter-md); border-bottom: 1px solid var(--color-dark-secondary); }
  h2 { flex: 1; margin: 0; font-size: var(--font-size-lg); font-weight: var(--font-weight-medium); }
  header button { display: grid; place-items: center; width: var(--control-height-lg); height: var(--control-height-lg); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); }
  .action-events-filter-modal__body { display: grid; align-items: start; min-height: 0; overflow-y: auto; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter); padding: var(--gutter); }
  .action-events-filter-modal__shortcuts { display: grid; gap: var(--gutter-sm); padding: var(--gutter-sm); }
  .action-events-filter-modal__shortcuts button { display: flex; align-items: center; gap: var(--gutter-md); width: 100%; border: 0; padding: var(--gutter-md); border-radius: var(--radius); text-align: left; color: var(--color-light-secondary); }
  .action-events-filter-modal__shortcuts button:is(:hover, [aria-pressed="true"]) { background: rgbaa(var(--color-accent-primary), 0.1); color: var(--color-light-primary); }
  @container (max-width: 530px) { .action-events-filter-modal__body { grid-template-columns: minmax(0, 1fr); } }
</style>
