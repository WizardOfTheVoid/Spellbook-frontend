<script lang="ts">
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import { onMount, onDestroy, type Snippet } from 'svelte'
  import { rememberNavigation } from '$lib/navigation/navigation'
  import { getServerApi, type AdminUserRecord } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import { timezone } from '$lib/settings/timezone'
  import { unwrap } from '$lib/utils/apiResult'
  import { formatFullDateTime, formatShortRelativeDateTime } from '$lib/utils/playerUtils'
  import { tooltip } from '$lib/utils/tooltip'
  import { accountStatus, accountStatusLabel, type AccountStatus } from './accountStatus'
  import { openAdminUserMenu } from './adminUserBan'
  import { UserListController } from './users/userListController'
  import { defaultUserFilters, defaultUserSort, filterAndSortUsers, type UserFilters, type UserSort } from './users/userFilters'
  import UserFiltersModal from './users/userFiltersModal.svelte'
  import EmptyState from '../ui/EmptyState.svelte'
  import AvatarUser from '../ui/avatars/avatarUser.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import ListRow from '../ui/ListRow.svelte'
  import SearchField from '../ui/SearchField.svelte'
  import FilterChipRow from '../ui/FilterChipRow.svelte'
  import Tag from '../ui/Tag.svelte'
  import { closeInfinityMenu, infinityMenuSeparator, infinityMenuState, openInfinityMenu, type InfinityMenuItem } from '../ui/infinityMenu'
  export let active = false
  export let onOpenUser: (userId: number) => void
  export let onBanUser: (user: AdminUserRecord) => void
  export let onHeaderActions: (actions: Snippet | null) => void = () => {}
  const controller = new UserListController(async (limit, offset) => unwrap<AdminUserRecord[]>(await getServerApi().admin.users.list({ limit, offset }), `Users could not be loaded.`), value => { state = value })
  let state = controller.state
  let filters: UserFilters = { ...defaultUserFilters }
  let sort: UserSort = { ...defaultUserSort }
  let filtersOpen = false
  let filterTrigger: HTMLButtonElement | undefined
  let sortTrigger: HTMLButtonElement | undefined
  let now = new Date()
  const statuses: AccountStatus[] = [`enabled`, `suspended`, `awaitingApproval`]
  const sortOptions: { value: UserSort[`field`], name: string, icon: string }[] = [
    { value: `lastActive`, name: `Last active`, icon: `fa-clock` },
    { value: `displayName`, name: `Name`, icon: `fa-user` },
    { value: `createdAt`, name: `Date joined`, icon: `fa-calendar` },
    { value: `currentVersion`, name: `SpellBook version`, icon: `fa-code-branch` }
  ]
  $: sortOpen = Boolean(sortTrigger && $infinityMenuState?.owner === sortTrigger)
  $: sortIcon = sort.direction === `asc` ? `fa-arrow-up-short-wide` : `fa-arrow-down-wide-short`
  $: sortLabel = `Sort: ${sortOptions.find(option => option.value === sort.field)?.name}, ${sort.direction === `asc` ? `ascending` : `descending`}`
  $: filteredUsers = filterAndSortUsers(state.users, filters, sort, $timezone)
  $: teams = [...new Map(state.users.flatMap(user => user.teams).map(team => [team.id, team])).values()].sort((a, b) => a.name.localeCompare(b.name))
  $: filterCount = filters.statuses.length + filters.teamIds.length + Number(filters.noTeams) + Number(Boolean(filters.joinedFrom || filters.joinedTo)) + Number(Boolean(filters.activeFrom || filters.activeTo))
  $: if (active && !state.loaded && !state.loading && !state.error) void controller.refresh()
  onMount(() => {
    onHeaderActions(actions)
    const timer = window.setInterval(() => { now = new Date() }, 60_000)
    return () => { onHeaderActions(null)
      window.clearInterval(timer) }
  })
  onDestroy(() => {
    controller.destroy()
    if (sortTrigger && $infinityMenuState?.owner === sortTrigger) closeInfinityMenu()
  })
  export function refresh(): void { void controller.refresh() }
  function toggleStatus(id: string): void {
    filters = { ...filters, statuses: filters.statuses.includes(id as AccountStatus) ? filters.statuses.filter(value => value !== id) : [...filters.statuses, id as AccountStatus] }
  }
  function openSortMenu(event: MouseEvent): void {
    const items: InfinityMenuItem[] = [
      ...sortOptions.map(option => ({ name: option.name, icon: option.icon,
        toggle: { checked: sort.field === option.value, group: `sort-field`, onChange: () => { sort = { ...sort, field: option.value } } } })),
      infinityMenuSeparator,
      ...([`desc`, `asc`] as const).map(direction => ({ name: direction === `asc` ? `Ascending` : `Descending`,
        icon: direction === `asc` ? `fa-arrow-up-short-wide` : `fa-arrow-down-wide-short`,
        toggle: { checked: sort.direction === direction, group: `sort-direction`, onChange: () => { sort = { ...sort, direction } } } }))
    ]
    openInfinityMenu({ name: `Sort users`, icon: sortIcon, placement: `bottom`, items }, { x: event.clientX, y: event.clientY }, sortTrigger)
  }
  rememberNavigation(`adminUserFilters`, () => ({ filters, sort }), value => { filters = value.filters
    sort = value.sort }, () => null)
</script>

{#snippet actions()}<IconButton icon="fa-rotate" ariaLabel="Refresh users" tooltip="Refresh users" disabled={state.loading} onClick={refresh} />{/snippet}

<div class="admin-users grid-stack gap-1">
  <div class="admin-users__toolbar">
    <SearchField bind:value={filters.search} placeholder="Search users" label="Users">
      <svelte:fragment slot="trailing"><IconButton icon="fa-sliders" position="absolute" ariaLabel={`Advanced filters${filterCount ? ` (${filterCount} active)` : ``}`} tooltip="Open additional user filters." controls="user-filters-dialog" hasPopup="dialog" expanded={filtersOpen} badge={filterCount || null} accentColor="var(--color-accent-secondary)" active={filtersOpen || filterCount > 0} bind:element={filterTrigger} onClick={() => { filtersOpen = !filtersOpen }} /></svelte:fragment>
    </SearchField>
    <IconButton bind:element={sortTrigger} icon={sortIcon} size="lg" ariaLabel={sortLabel} tooltip={sortLabel} expanded={sortOpen} active={sortOpen} accentColor="var(--color-accent-tertiary)" sfx={null} onClick={openSortMenu} />
  </div>
  <FilterChipRow chips={statuses.map(id => ({ id, label: accountStatusLabel(id) }))} selected={filters.statuses} onToggle={toggleStatus} onReset={() => { filters = { ...defaultUserFilters } }} />
  <div class="admin-users__selections">
    {#each filters.teamIds as id}<Tag label={teams.find(team => team.id === id)?.name ?? `Team #${id}`} selected onClick={() => { filters = { ...filters, teamIds: filters.teamIds.filter(value => value !== id) } }} />{/each}
    {#if filters.noTeams}<Tag label="No teams" selected onClick={() => { filters = { ...filters, noTeams: false } }} />{/if}
    {#if filters.joinedFrom || filters.joinedTo}<Tag label="Date joined" selected onClick={() => { filters = { ...filters, joinedFrom: null, joinedTo: null } }} />{/if}
    {#if filters.activeFrom || filters.activeTo}<Tag label="Last active" selected onClick={() => { filters = { ...filters, activeFrom: null, activeTo: null } }} />{/if}
  </div>
  {#if state.error}<p role="alert">{state.error}</p>{/if}
  {#each filteredUsers as user (user.id)}
    <ListRow title={getAdminName(user)} subtitle={`${user.playfabId ?? `No PlayFab ID`} · @${user.username}`} onClick={() => onOpenUser(user.id)} onContextMenu={event => openAdminUserMenu(event, { actor: $authState.user, user, onOpenUser, onBan: onBanUser })}>
      <svelte:fragment slot="leading"><AvatarUser src={user.avatarUrl} size={44} fallbackTone="muted" /></svelte:fragment>
      <svelte:fragment slot="meta"><div class="admin-users__meta"><span>{user.teams.map(team => team.name).join(` · `) || `No teams`}</span><span use:tooltip={user.lastActive ? formatFullDateTime(user.lastActive) : ``}>Last active: {user.lastActive ? formatShortRelativeDateTime(user.lastActive, now) : `Never`}</span></div></svelte:fragment>
      <svelte:fragment slot="trailing"><div class="admin-users__status"><span>{user.currentVersion ?? `Not reported`}</span><span class:suspended={accountStatus(user) === `suspended`}>{accountStatusLabel(accountStatus(user))}</span></div></svelte:fragment>
    </ListRow>
  {:else}<EmptyState title={state.loading ? `Loading users` : `No users`} message={state.loading ? `Getting user accounts.` : `No users match these filters.`} />{/each}
</div>
{#if filtersOpen}<UserFiltersModal {filters} {teams} returnFocus={filterTrigger ?? null} onChange={value => { filters = value }} onClose={() => { filtersOpen = false }} />{/if}

<style lang="scss">
  .admin-users__toolbar { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: var(--gutter-sm); }
  .admin-users__selections, .admin-users__meta { display: flex; flex-wrap: wrap; gap: var(--gutter-sm) var(--gutter-md); }
  .admin-users__meta { color: var(--color-light-tertiary); font-size: var(--font-size-xs); margin-top: var(--gutter-sm); }
  .admin-users__status { display: grid; justify-items: end; gap: var(--gutter-sm); color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  .admin-users__status .suspended { color: var(--color-accent-quaternary); }
</style>
