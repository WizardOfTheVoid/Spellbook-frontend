<script lang="ts">
  import { onMount } from 'svelte'
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import { productVersion } from '@spellbook/shared/productVersion'
  import { getOverlayApi, type UserSession } from '$lib/core'
  import type { ActivePage } from '$lib/types/ui'
  import { navigation, rememberNavigation } from '$lib/navigation/navigation'
  import { gameState } from '$lib/gameState/gameStateStore'
  import { isInGameServer } from '../../../../../shared/gameState'
  import { pendingTeamRequests } from '$lib/stores/pendingTeamRequests'
  import { tooltip } from '$lib/utils/tooltip'
  import { celebrateElement } from '$lib/utils/celebrate'
  import logoUrl from '$lib/resources/logo-plain.svg?url'
  import KeybindValue from '$lib/components/ui/KeybindValue.svelte'
  import CountBadge from '$lib/components/ui/CountBadge.svelte'
  import { closeInfinityMenu, infinityMenuState } from '$lib/components/ui/infinityMenu'
  import { openCredits } from '$lib/components/credits/credits'
  import { openAccountInfinityMenu } from './accountInfinityMenu'
  import HelpModal from './helpModal.svelte'
  import { markAutoHelpDisplayed, nextAutoHelpView, onHelpRequested, type AutoHelpView, type HelpView } from './helpNotice'

  const links = {
    "sections": [
      {
        "id": "overview",
        "label": "Overview",
        "items": [
          { "page": "dashboard", "label": "Dashboard", "icon": "fa-chart-line" },
          { "page": "server", "label": "Game Server", "icon": "fa-gamepad", "status": "inServer" },
          { "page": "notifications", "label": "Notifications", "icon": "fa-bell", "badge": "notifications" }
        ]
      },
      {
        "id": "moderation",
        "label": "Moderation",
        "items": [
          { "page": "wanted", "label": "Wanted", "icon": "fa-crosshairs" },
          { "page": "profiles", "label": "Profiles", "icon": "fa-layer-group" }
        ]
      },
      {
        "id": "community",
        "label": "Community",
        "items": [
          { "page": "players", "label": "Players", "icon": "fa-users" },
          { "page": "teams", "label": "My teams", "icon": "fa-users-gear", "badge": "teamRequests" },
          { "page": "servers", "label": "Server browser", "icon": "fa-server" }
        ]
      },
      {
        "id": "configuration",
        "label": "Configuration",
        "items": [
          { "page": "settings", "label": "Settings", "icon": "fa-gear" },
          { "page": "admin", "label": "Admin", "icon": "fa-shield-halved", "superadminOnly": true },
          { "action": "help", "label": "Help", "icon": "fa-circle-question" }
        ]
      }
    ]
  } satisfies MenuLinks

  type MenuItem = {
    label: string
    icon: string
    badge?: `notifications` | `teamRequests`
    status?: `inServer`
    superadminOnly?: boolean
  } & ({ page: ActivePage, action?: never } | { action: `help`, page?: never })

  type MenuSection = { id: string, label: string, items: MenuItem[] }
  type MenuLinks = { sections: MenuSection[] }

  export let activePage: ActivePage
  export let serverDisplayName = `Current game server`
  export let user: UserSession
  export let notificationCount = 0
  export let onSelectPage: (page: ActivePage) => void | Promise<boolean>
  export let onLogout: () => Promise<void>

  let avatarButton: HTMLButtonElement
  let helpButton: HTMLButtonElement
  let helpOpen = false
  let helpView: HelpView = `welcome`
  let helpReturnFocus: HTMLButtonElement | null = null
  let automaticHelp: { userId: number, view: AutoHelpView } | null = null
  let helpUserId: number | null = null

  $: sections = links.sections.map<MenuSection>(section => ({
    ...section,
    items: section.items.filter((entry: MenuItem) => !entry.superadminOnly || user.isSuperadmin)
  })).filter(section => section.items.length)
  $: badges = { notifications: badgeCount(notificationCount), teamRequests: badgeCount($pendingTeamRequests) }
  $: inServer = isInGameServer($gameState)
  $: accountMenuOpen = Boolean(avatarButton && $infinityMenuState?.owner === avatarButton)
  $: if (user.id !== helpUserId) {
    helpUserId = user.id
    automaticHelp = null
    helpOpen = false
    if (accountMenuOpen) closeInfinityMenu()
    void openAutomaticHelp()
  }

  rememberNavigation(`help`, () => ({ helpOpen, helpView }), state => {
    helpOpen = state.helpOpen
    helpView = state.helpView
  }, state => state.helpOpen ? state.helpView : null)

  function badgeCount(count: number): number {
    return Number.isFinite(count) && count >= 1 ? Math.trunc(count) : 0
  }

  function openHelp(view: HelpView, trigger: HTMLButtonElement): void {
    void navigation.visit(() => {
      helpView = view
      helpReturnFocus = trigger
      helpOpen = true
    })
  }

  async function openAutomaticHelp(): Promise<void> {
    if (!helpButton || helpOpen || automaticHelp || !user.isActive) return
    const userId = user.id
    try {
      if (!(await getOverlayApi().isVisible()) || helpOpen || automaticHelp || user.id !== userId) return
    } catch {
      return
    }
    const view = nextAutoHelpView(localStorage, userId, productVersion)
    if (!view) return
    automaticHelp = { userId, view }
    openHelp(view, helpButton)
  }

  function markAutomaticHelpDisplayed(): void {
    const notice = automaticHelp
    automaticHelp = null
    if (!notice || notice.userId !== user.id) return
    markAutoHelpDisplayed(localStorage, notice.userId, productVersion, notice.view)
  }

  function closeHelp(): void {
    automaticHelp = null
    void navigation.visit(() => { helpOpen = false })
  }

  onMount(() => {
    const stopHelp = onHelpRequested(view => openHelp(view, helpButton))
    const stopNavigation = window.chivOverlay?.onNavigate?.(destination => {
      if (destination === `help`) openHelp(`welcome`, helpButton)
      else void navigation.visit(async () => {
        helpOpen = false
        await onSelectPage(destination)
      })
    })
    const stopVisibility = window.chivOverlay?.onVisibilityChange(visible => {
      if (visible) void openAutomaticHelp()
    })
    void openAutomaticHelp()
    return () => {
      stopHelp()
      stopNavigation?.()
      stopVisibility?.()
      if ($infinityMenuState?.owner === avatarButton) closeInfinityMenu()
    }
  })
</script>

{#snippet overlayShortcut()}Press <KeybindValue name="overlayKey" /> to toggle overlay{/snippet}

{#snippet itemContent(entry: MenuItem)}
  <i class={`fa-solid ${entry.icon}`} aria-hidden="true"></i>
  <span class="item-label">{entry.label}</span>
  {#if entry.status === `inServer` && inServer}<span class="server-status" role="img" aria-label="Connected to game server"></span>{/if}
  {#if entry.badge}<CountBadge count={badges[entry.badge]} />{/if}
{/snippet}

<aside class="menu-bar" aria-label="Primary navigation">
  <header class="menu-header">
    <div class="brand" use:tooltip={{ text: `Toggle overlay`, content: overlayShortcut, detailed: false }}>
      <img src={logoUrl} alt="" />
      <span>SpellBook</span>
    </div>
    <span class="version">v{productVersion}</span>
  </header>

  <nav aria-label="Main menu">
    {#each sections as section (section.id)}
      <section aria-labelledby={`menu-${section.id}`}>
        <h2 id={`menu-${section.id}`}>{section.label}</h2>
        {#each section.items as entry (entry.page ?? entry.action)}
          {#if entry.action === `help`}
            <button
              bind:this={helpButton}
              class="menu-link"
              class:active={helpOpen}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={helpOpen}
              data-uisfx="select"
              data-uisfx-hover="hover"
              on:click={() => {
                celebrateElement(helpButton)
                openHelp(`welcome`, helpButton)
              }}
            >{@render itemContent(entry)}</button>
          {:else}
            <button
              class="menu-link"
              class:active={activePage === entry.page}
              type="button"
              aria-current={activePage === entry.page ? `page` : undefined}
              use:tooltip={entry.page === `server` ? { text: entry.label, emphasis: serverDisplayName } : entry.label}
              data-uisfx="select"
              data-uisfx-hover="hover"
              on:click={() => onSelectPage(entry.page)}
            >{@render itemContent(entry)}</button>
          {/if}
        {/each}
      </section>
    {/each}
  </nav>

  <footer>
    <button
      bind:this={avatarButton}
      class="account-button"
      class:active={accountMenuOpen || activePage === `account`}
      type="button"
      aria-label="Account menu"
      aria-haspopup="menu"
      aria-expanded={accountMenuOpen}
      data-uisfx={accountMenuOpen ? `close` : `open`}
      data-uisfx-hover="hover"
      on:click={event => openAccountInfinityMenu(event, {
        user, onSelectPage, onLogout,
        onCredits: () => openCredits(avatarButton),
        onHelp: view => openHelp(view, avatarButton)
      })}
    >
      <span class="avatar">{#if user.avatarUrl}<img src={user.avatarUrl} alt="" />{:else}<i class="fa-solid fa-user" aria-hidden="true"></i>{/if}</span>
      <span class="account-details">
        <span class="account-heading"><span class="account-name">{getAdminName(user)}</span><span class="you-tag">You</span></span>
        <span class="account-role">{user.isSuperadmin ? `Superadmin` : `Administrator`}</span>
      </span>
      <i class="fa-solid fa-chevron-right account-chevron" aria-hidden="true"></i>
    </button>
  </footer>
</aside>

{#if helpOpen}
  <HelpModal
    bind:view={helpView}
    {onSelectPage}
    returnFocus={helpReturnFocus}
    onDisplayed={markAutomaticHelpDisplayed}
    onClose={closeHelp}
    onCredits={async () => {
      await navigation.visit(() => { helpOpen = false })
      openCredits(helpReturnFocus)
    }}
  />
{/if}

<style lang="scss">
  .menu-bar {
    position: relative;
    z-index: var(--z-panel);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    border: 1px solid rgbaa(var(--color-dark-secondary), 0.35);
    border-radius: var(--radius-xl);
    background: var(--color-dark-primary);
    background-image: linear-gradient(155deg, rgbaa(var(--color-dark-secondary), 0.2), transparent 60%);
    box-shadow: var(--shadow);
  }
  .menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 16px;
    padding: 20px 0;
    border-bottom: 1px solid rgbaa(var(--color-dark-secondary), 0.5);
  }
  .brand { display: flex; align-items: center; gap: 8px; font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); }
  .brand img { width: 32px; height: 38px; object-fit: contain; }
  .version { flex-shrink: 0; padding: 6px 8px; border-radius: 8px; color: var(--color-light-secondary); background: rgbaa(var(--color-dark-secondary), 0.4); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
  nav { min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 12px; }
  section { padding: 18px 0; }
  section + section { border-top: 1px solid rgbaa(var(--color-dark-secondary), 0.5); }
  h2 { margin: 0 12px 8px; color: var(--color-light-tertiary); font-size: var(--font-size-caption); font-weight: var(--font-weight-medium); letter-spacing: 0.18em; text-transform: uppercase; }
  button {
    position: relative;
    width: 100%;
    border: 1px solid transparent;
    border-radius: 9px;
    background: transparent;
    color: var(--color-light-secondary);
    text-align: left;
    transition: color var(--motion-fast) var(--motion-ease), background-color var(--motion-fast) var(--motion-ease), border-color var(--motion-fast) var(--motion-ease);
  }
  button:hover { background: rgbaa(var(--color-dark-secondary), 0.35); color: var(--color-light-primary); transition-duration: 0ms; }
  button:active { background: rgbaa(var(--color-light-tertiary), 0.12); transition-duration: 0ms; }
  button:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
  button.active { border-color: rgbaa(var(--color-accent-primary), 0.4); background: rgbaa(var(--color-accent-primary), 0.14); color: var(--color-light-primary); }
  .menu-link { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 10px 12px; font-size: var(--font-size-md); }
  .menu-link > i { width: 20px; flex-shrink: 0; color: var(--color-light-secondary); text-align: center; font-size: var(--font-size-xl); }
  .menu-link.active > i { color: var(--color-accent-primary); }
  .menu-link.active::before { position: absolute; inset: 5px auto 5px -1px; width: 3px; border-radius: 3px; background: var(--color-accent-primary); box-shadow: 0 0 12px rgbaa(var(--color-accent-primary), 0.65); content: ""; }
  .item-label { flex: 1; min-width: 0; }
  .server-status { width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: var(--color-accent-secondary); box-shadow: 0 0 0 4px rgbaa(var(--color-accent-secondary), 0.12); }
  footer { padding: 12px; border-top: 1px solid rgbaa(var(--color-dark-secondary), 0.5); }
  .account-button { display: grid; grid-template-columns: 42px minmax(0, 1fr) 12px; align-items: center; gap: 10px; padding: 8px 4px; }
  .avatar { display: grid; place-items: center; width: 42px; height: 42px; overflow: hidden; border-radius: 50%; background: var(--color-dark-secondary); }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .account-details { display: grid; gap: 5px; min-width: 0; }
  .account-heading { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .account-name { overflow: hidden; color: var(--color-light-primary); font-size: var(--font-size-md); font-weight: var(--font-weight-bold); text-overflow: ellipsis; white-space: nowrap; }
  .you-tag { flex-shrink: 0; padding: 2px 5px; border: 1px solid rgbaa(var(--color-accent-primary), 0.55); border-radius: 6px; background: rgbaa(var(--color-accent-primary), 0.12); color: var(--color-accent-primary); font-size: var(--font-size-caption); }
  .account-role { color: var(--color-light-tertiary); font-size: var(--font-size-label); }
  .account-chevron { color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>
