<script lang="ts">
  import { onDestroy } from 'svelte'
  import { closeInfinityMenu, infinityMenuSeparator, infinityMenuState, openInfinityMenu, type InfinityMenuItem } from '$lib/components/ui/infinityMenu'

  let root: HTMLDivElement
  let views: Array<`online` | `banned`> = [`online`]
  let filters = [`low-rank`]
  let sortBy: `lastSeen` | `rank` = `lastSeen`
  let sortOrder: `asc` | `desc` = `desc`
  let lastAction = `None`

  onDestroy(() => {
    if ($infinityMenuState?.owner && root?.contains($infinityMenuState.owner)) closeInfinityMenu()
  })

  function showMenu(event: MouseEvent, name: string, subtitle: string, icon: string, items: InfinityMenuItem[]): void {
    const owner = event.currentTarget as HTMLElement
    openInfinityMenu({ name, subtitle, icon, placement: `bottom`, items }, { x: event.clientX, y: event.clientY }, owner)
  }

  function showViews(event: MouseEvent): void {
    const choices: { id: `online` | `banned`, name: string, subtitle: string, icon: string }[] = [
      { id: `online`, name: `Online`, subtitle: `Players currently online`, icon: `fa-circle` },
      { id: `banned`, name: `Banned`, subtitle: `Active bans`, icon: `fa-ban` }
    ]
    showMenu(event, `Select a view`, `Combine saved view presets.`, `fa-users`, [
      { name: `All players`, subtitle: `Clear selected views`, icon: `fa-users`, action: () => { views = [] } },
      ...choices.map(choice => ({
        name: choice.name,
        subtitle: choice.subtitle,
        icon: choice.icon,
        iconColor: choice.id === `online` ? `var(--color-accent-secondary)` : undefined,
        toggle: { checked: views.includes(choice.id), onChange: (checked: boolean) => {
          views = checked ? [...views, choice.id] : views.filter(id => id !== choice.id)
        } }
      }))
    ])
  }

  function showFilters(event: MouseEvent): void {
    const choices = [
      { id: `low-rank`, name: `Low rank`, subtitle: `Rank below 50`, icon: `fa-chart-column` },
      { id: `banned`, name: `Banned`, subtitle: `Active bans`, icon: `fa-ban` },
      { id: `non-eu`, name: `Non-EU`, subtitle: `Live ping of 120 ms or higher`, icon: `fa-globe` }
    ]
    showMenu(event, `Filter players`, `Independent toggles stay open after selection.`, `fa-filter`, choices.map(choice => ({
      name: choice.name,
      subtitle: choice.subtitle,
      icon: choice.icon,
      toggle: { checked: filters.includes(choice.id), onChange: checked => {
        filters = checked ? [...filters, choice.id] : filters.filter(id => id !== choice.id)
      } }
    })))
  }

  function showSort(event: MouseEvent): void {
    showMenu(event, `Sort players`, `Field and direction are separate exclusive groups.`, `fa-arrow-down-wide-short`, [
      { name: `Last seen`, icon: `fa-clock`, toggle: { checked: sortBy === `lastSeen`, group: `gallery-sort-field`, onChange: () => { sortBy = `lastSeen` } } },
      { name: `Rank`, icon: `fa-chart-simple`, toggle: { checked: sortBy === `rank`, group: `gallery-sort-field`, onChange: () => { sortBy = `rank` } } },
      infinityMenuSeparator,
      { name: `Descending`, icon: `fa-arrow-down-wide-short`, toggle: { checked: sortOrder === `desc`, group: `gallery-sort-direction`, onChange: () => { sortOrder = `desc` } } },
      { name: `Ascending`, icon: `fa-arrow-up-wide-short`, toggle: { checked: sortOrder === `asc`, group: `gallery-sort-direction`, onChange: () => { sortOrder = `asc` } } }
    ])
  }

  function showActions(event: MouseEvent): void {
    showMenu(event, `More options`, `Actions, links, children, and disabled items.`, `fa-ellipsis`, [
      { name: `Copy profile ID`, subtitle: `Runs a local action`, icon: `fa-copy`, action: () => { lastAction = `Copy profile ID` } },
      { name: `Download SpellBook`, subtitle: `Opens a link`, icon: `fa-arrow-up-right-from-square`, action: `https://chivalry2.dev/download` },
      { name: `Moderation`, subtitle: `Child menu`, icon: `fa-shield`, children: [
        { name: `Review offenses`, subtitle: `Nested action`, icon: `fa-list`, action: () => { lastAction = `Review offenses` } }
      ] },
      { name: `Unavailable`, icon: `fa-lock`, disabled: true }
    ])
  }
</script>

<div class="infinity-gallery" bind:this={root}>
  <p>Open each menu to inspect its selection and option states. Toggles remain open while actions close the menu.</p>
  <div class="infinity-gallery__buttons">
    <button type="button" aria-haspopup="menu" data-uisfx-ignore="true" on:click={showViews}>Multiple views</button>
    <button type="button" aria-haspopup="menu" data-uisfx-ignore="true" on:click={showFilters}>Independent filters</button>
    <button type="button" aria-haspopup="menu" data-uisfx-ignore="true" on:click={showSort}>Sort field and direction</button>
    <button type="button" aria-haspopup="menu" data-uisfx-ignore="true" on:click={showActions}>Actions and children</button>
  </div>
  <code>Views: {views.join(`, `) || `all`} · Filters: {filters.join(`, `) || `none`} · Sort: {sortBy} {sortOrder} · Last action: {lastAction}</code>
</div>

<style lang="scss">
  .infinity-gallery { display: grid; gap: var(--gutter-md); }
  p { margin: 0; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .infinity-gallery__buttons { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
  button { min-height: var(--control-height-sm); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); padding: 0 var(--gutter-md); background: var(--color-dark-primary); color: var(--color-light-primary); font-size: var(--font-size-xs); }
  code { color: var(--color-light-secondary); font-size: var(--font-size-xs); white-space: normal; }
</style>
