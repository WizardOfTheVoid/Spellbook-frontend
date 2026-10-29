<script lang="ts">
  import { onMount } from 'svelte'
  import type { UserTeamSummary } from '$lib/core'
  import { containModalTab, mountModalEnvironment } from '$lib/utils/quickActionUi'
  import { pickerValue } from '../../ui/datePickerValues'
  import { accountStatusLabel, type AccountStatus } from '../accountStatus'
  import { defaultUserFilters, type UserFilters } from './userFilters'
  import FilterChipRow from '../../ui/FilterChipRow.svelte'
  import MultiSelect from '../../ui/MultiSelect.svelte'
  import DateInput from '../../ui/DateInput.svelte'
  import Button from '../../ui/Button.svelte'
  import IconButton from '../../ui/IconButton.svelte'
  export let filters: UserFilters
  export let teams: UserTeamSummary[]
  export let returnFocus: HTMLButtonElement | null = null
  export let onChange: (filters: UserFilters) => void
  export let onClose: () => void
  let root: HTMLDivElement
  let dialog: HTMLDivElement
  let closeButton: HTMLButtonElement | undefined
  const statuses: AccountStatus[] = [`enabled`, `suspended`, `awaitingApproval`]
  $: teamOptions = [{ value: `none`, label: `No teams` }, ...teams.map(team => ({ value: String(team.id), label: team.name }))]
  $: selectedTeams = [...filters.teamIds.map(String), ...(filters.noTeams ? [`none`] : [])]
  function update(change: Partial<UserFilters>): void { onChange({ ...filters, ...change }) }
  onMount(() => {
    const restore = mountModalEnvironment(root, returnFocus)
    const key = (event: KeyboardEvent) => {
      if (event.key === `Escape`) onClose()
      containModalTab(event, dialog, document.activeElement)
    }
    window.addEventListener(`keydown`, key)
    closeButton?.focus()
    return () => { window.removeEventListener(`keydown`, key)
      restore() }
  })
</script>

<div class="user-filters-modal" bind:this={root}>
  <button class="user-filters-modal__backdrop" type="button" aria-label="Close filters" tabindex="-1" on:click={onClose}></button>
  <div id="user-filters-dialog" class="user-filters-modal__dialog" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="user-filters-title" tabindex="-1">
    <header><h2 id="user-filters-title">Filters</h2><IconButton icon="fa-xmark" ariaLabel="Close filters" bind:element={closeButton} onClick={onClose} /></header>
    <FilterChipRow chips={statuses.map(id => ({ id, label: accountStatusLabel(id) }))} selected={filters.statuses} onToggle={id => update({ statuses: filters.statuses.includes(id as AccountStatus) ? filters.statuses.filter(value => value !== id) : [...filters.statuses, id as AccountStatus] })} />
    <MultiSelect label="Teams" options={teamOptions} value={selectedTeams} onChange={values => update({ teamIds: values.filter(value => value !== `none`).map(Number), noTeams: values.includes(`none`) })} />
    <DateInput label="Date joined" range maxToday value={filters.joinedFrom ?? ``} endValue={filters.joinedTo ?? ``} onRangeChange={(start, end) => update({ joinedFrom: pickerValue(start) || null, joinedTo: pickerValue(end) || null })} />
    <DateInput label="Last active" range maxToday value={filters.activeFrom ?? ``} endValue={filters.activeTo ?? ``} onRangeChange={(start, end) => update({ activeFrom: pickerValue(start) || null, activeTo: pickerValue(end) || null })} />
    <footer><Button label="Reset filters" onClick={() => onChange({ ...defaultUserFilters, search: filters.search })} /><Button label="Done" variant="primary" onClick={onClose} /></footer>
  </div>
</div>

<style lang="scss">
  .user-filters-modal { position: absolute; inset: 0; z-index: 35; display: grid; place-items: start center; padding: var(--gutter); }
  .user-filters-modal__backdrop { position: absolute; inset: 0; border: 0; border-radius: 0; background: rgba(2, 8, 13, 0.65); }
  .user-filters-modal__dialog { position: relative; box-sizing: border-box; width: min(680px, 100%); max-height: 100%; overflow: auto; display: grid; gap: var(--gutter-lg); padding: var(--gutter-lg); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); background: var(--color-dark-primary); box-shadow: var(--shadow); }
  header, footer { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-md); }
  h2 { margin: 0; font-size: var(--font-size-lg); }
</style>
