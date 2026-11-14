<script lang="ts">
  import AvatarUser from '../ui/avatars/avatarUser.svelte'
  import AvatarTeam from '../ui/avatars/avatarTeam.svelte'
  import Icon from '../ui/Icon.svelte'
  import IconBadge from '../ui/IconBadge.svelte'
  import IconButton from '../ui/IconButton.svelte'
  import StatChip from '../ui/StatChip.svelte'
  import DateStamp from '../ui/dateStamp.svelte'
  import { openInfinityMenu, infinityMenuState } from '../ui/infinityMenu'
  import { tooltip } from '$lib/utils/tooltip'
  import { actionEventOrigins, actionEventStatuses } from './actionEventsQuery'
  import { createActionEventsMenu, type ActionEventsMenuActions } from './actionEventsMenu'
  import type { ActionEvent } from './actionEventsTypes'
  import { profileActionIcon, profileActionIconColor } from '$lib/utils/profileActions'

  export let event: ActionEvent
  export let busy = false
  export let entering = false
  export let actions: ActionEventsMenuActions
  let row: HTMLDivElement
  $: status = actionEventStatuses[event.status]
  $: actor = event.admin?.name ?? event.ruleset ?? `SpellBook`
  $: player = event.target.type === `player` ? event.target.player : null
  $: actionIcon = profileActionIcon(event.action)
  $: profileColor = profileActionIconColor(event.action)
  $: actionColor = profileColor === `var(--color-light-primary)` ? null : profileColor
  $: actionTooltip = [
    ...[...new Set(event.action.commands.filter(command => [`server_message`, `admin_message`].includes(command.commandType)).map(command => command.message).filter(Boolean))].map(message => `Message: ${message}`),
    event.reason ? `Reason: ${event.reason}` : null
  ].filter(Boolean).join(`\n\n`)

  function showMenu(input: MouseEvent): void {
    input.preventDefault()
    input.stopPropagation()
    const rect = input.currentTarget instanceof HTMLElement ? input.currentTarget.getBoundingClientRect() : row.getBoundingClientRect()
    const menu = createActionEventsMenu(event, busy, actions)
    if (input.type !== `contextmenu`) menu.placement = `bottom`
    openInfinityMenu(menu, input.type === `contextmenu` ? { x: input.clientX, y: input.clientY } : { x: rect.right, y: rect.bottom }, row)
  }
</script>

<div bind:this={row} class="action-event" role="group" aria-label={`${event.action.label} by ${actor}`} data-action-event={event.id} style:--event-tone={actionColor}
  class:action-event--colored={Boolean(actionColor)} class:action-event--selected={$infinityMenuState?.owner === row} class:action-event--busy={busy} class:action-event--entering={entering}
  on:contextmenu={showMenu}>
  <div class="action-event__flow">
    <div class="action-event__identity" use:tooltip={actor}>
      {#if event.admin}<AvatarUser src={event.admin.avatarUrl} name={actor} size="md" />
      {:else}<IconBadge name="fa-gears" tone="accent" size="md" shape="round" />{/if}
      <div class="action-event__name"><strong>{actor}</strong></div>
    </div>
    <span class="action-event__arrow" aria-hidden="true"><Icon name="fa-arrow-right-long" size="sm" /></span>
    <span class="action-event__action" use:tooltip={actionTooltip || event.action.label}><Icon name={actionIcon.name} type={actionIcon.type} size="sm" /><b>{event.action.label}</b></span>
    <span class="action-event__arrow" aria-hidden="true"><Icon name="fa-arrow-right-long" size="sm" /></span>
    <div class="action-event__identity action-event__target" use:tooltip={player ? `${player.name}\n${player.playfabId}\nOn: ${event.server.name}` : event.server.name}>
      <AvatarTeam src={event.server.avatarUrl} name={event.server.name} size="md" fallbackIcon="fa-server" fallbackTone="var(--color-light-secondary)" />
      <div class="action-event__name"><strong>{player?.name ?? `Server`}</strong><small>{player ? `On: ${event.server.name}` : event.server.name}</small></div>
    </div>
    <IconButton icon="fa-ellipsis-vertical" ariaLabel={`Options for ${event.action.label} by ${actor}`} size="sm" onClick={showMenu} disabled={busy} />
  </div>
  <div class="action-event__details">
    {#if event.team}<span class="action-event__meta" use:tooltip={event.team.name}><StatChip label="Team" showLabel={false} value={event.team.name} icon="fa-users" valueTone="muted" tone="accent" /></span>{/if}
    <span use:tooltip={`Origin: ${(event.origin ? actionEventOrigins[event.origin] : `Unknown`)}`}><StatChip label="Origin" showLabel={false} value={(event.origin ? actionEventOrigins[event.origin] : `Unknown`)} icon={event.origin === `discord` ? `fa-comment` : event.origin === `ruleset` ? `fa-gears` : `fa-gamepad`} valueTone="muted" tone="accent" /></span>
    <span use:tooltip={`Execution: ${event.execution === `automatic` ? `Automatic` : `Manual`}`}><StatChip label="Execution" showLabel={false} value={event.execution === `automatic` ? `Automatic` : `Manual`} icon={event.execution === `automatic` ? `fa-gears` : `fa-hand`} valueTone="muted" tone="accent" /></span>
    <span class="action-event__requested"><Icon name="fa-clock" tone="accent" size="sm" /><span>Requested</span><DateStamp value={event.requestedAt} format="time" styled={false} /></span>
    <span class="action-event__status" data-tone={status.tone}><Icon name={busy ? `fa-circle-notch` : status.icon} size="sm" /><b>{busy ? `Cancelling…` : status.label}</b>{#if event.completedAt}<DateStamp value={event.completedAt} format="time" styled={false} />{/if}</span>
  </div>
</div>

<style lang="scss">
  .action-event { border: 1px solid var(--event-tone, var(--color-dark-secondary)); border-radius: var(--radius); padding: var(--gutter-md); background: transparent; min-width: 0; opacity: 1; transform: translateY(0); box-shadow: 0 0 0 rgbaa(var(--event-tone, var(--color-dark-tertiary)), 0), inset 0 0 0 rgbaa(var(--event-tone, var(--color-dark-tertiary)), 0); transition: opacity var(--motion-arrival) var(--easing), transform var(--motion-arrival) var(--easing), box-shadow var(--motion-arrival) var(--easing); }
  .action-event--colored { background: rgbaa(var(--event-tone), 0.05); }
  .action-event--selected, .action-event:hover { border-color: var(--event-tone, var(--color-dark-tertiary)); }
  .action-event--busy { opacity: 0.7; }
  .action-event--entering { opacity: 0; transform: translateY(calc(-1 * var(--gutter-sm))); box-shadow: 0 0 var(--gutter-lg) rgbaa(var(--event-tone, var(--color-dark-tertiary)), 0.26), inset 0 0 var(--gutter-md) rgbaa(var(--event-tone, var(--color-dark-tertiary)), 0.12); }
  @media (prefers-reduced-motion: reduce) { .action-event { transition: none; } .action-event--entering { opacity: 1; transform: none; box-shadow: none; } }
  .action-event__flow { display: grid; grid-template-columns: minmax(0, 1fr) var(--icon-size-lg) minmax(60px, auto) var(--icon-size-lg) minmax(0, 1.2fr) auto; align-items: center; gap: var(--gutter-md); }
  .action-event__identity { display: flex; align-items: center; gap: var(--gutter-md); min-width: 0; }
  .action-event__name { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-sm); min-width: 0; }
  .action-event__target .action-event__name { display: grid; gap: calc(var(--gutter-sm) / 4); }
  .action-event__name strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-label); font-weight: var(--font-weight-medium); color: var(--color-light-primary); }
  .action-event__name small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  .action-event__arrow { color: var(--color-light-tertiary); text-align: center; }
  .action-event__action { display: inline-flex; align-items: center; justify-content: center; gap: var(--gutter-sm); border: 1px solid var(--event-tone, var(--color-dark-secondary)); border-radius: var(--radius); padding: calc(var(--gutter-sm) / 2) var(--gutter-sm); color: var(--event-tone, var(--color-light-secondary)); font-size: var(--font-size-label); white-space: nowrap; }
  .action-event__action b, .action-event__status b { font-weight: var(--font-weight-medium); }
  .action-event__details { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-sm) var(--gutter-md); margin-top: var(--gutter-md); font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  .action-event__details :global(.stat-chip), .action-event__details :global(.stat-chip__value) { font-size: inherit; }
  .action-event__meta { max-width: 190px; min-width: 0; }
  .action-event__meta :global(.stat-chip) { max-width: 100%; }
  .action-event__meta :global(.stat-chip__value) { overflow: hidden; text-overflow: ellipsis; }
  .action-event__requested, .action-event__status { display: inline-flex; align-items: center; gap: var(--gutter-sm); white-space: nowrap; }
  .action-event__status { --event-tone: var(--color-light-tertiary); color: var(--event-tone); }
  .action-event__status[data-tone="success"] { --event-tone: var(--color-accent-secondary); }
  .action-event__status[data-tone="danger"] { --event-tone: var(--color-danger); }
  .action-event__status[data-tone="warning"] { --event-tone: var(--color-accent-tertiary); }
  .action-event__status[data-tone="accent"] { --event-tone: var(--color-accent-tertiary); }
  .action-event__status :global(time) { font-weight: var(--font-weight); }
  @container (max-width: 700px) {
    .action-event__flow { grid-template-columns: minmax(0, 1fr) var(--icon-size-md) auto var(--icon-size-md) minmax(0, 1fr) auto; gap: var(--gutter-sm); }
    .action-event__name { display: grid; }
  }
  @container (max-width: 450px) {
    .action-event__identity { gap: var(--gutter-sm); }
    .action-event__action { padding: var(--gutter-sm); }
    .action-event__action b { max-width: 62px; overflow: hidden; text-overflow: ellipsis; }
  }
</style>
