<script lang="ts">
  import { onMount } from 'svelte'
  import { getAdminName } from '@spellbook/shared/adminName.js'
  import type { TeamMemberRecord } from '$lib/core'
  import { containModalTab, mountModalEnvironment } from '$lib/utils/quickActionUi'
  import { filterInviteCandidates } from './inviteMemberSearch'
  import AvatarUser from '../../ui/avatars/avatarUser.svelte'
  import IconButton from '../../ui/IconButton.svelte'
  import Button from '../../ui/Button.svelte'
  import SearchField from '../../ui/SearchField.svelte'
  import EmptyState from '../../ui/EmptyState.svelte'
  export let users: TeamMemberRecord[] = []
  export let loading = false
  export let returnFocus: HTMLButtonElement | null = null
  export let onLoad: () => Promise<void>
  export let onAdd: (user: TeamMemberRecord) => Promise<void>
  export let onClose: () => void
  let root: HTMLDivElement
  let dialog: HTMLDivElement
  let query = ``
  let loaded = false
  let error = ``
  let sendingId: number | null = null
  let disposed = false
  $: candidates = filterInviteCandidates(users, query)
  async function load(): Promise<void> {
    error = ``
    try { await onLoad()
      if (!disposed) loaded = true }
    catch (value) { if (!disposed) { loaded = true
      error = value instanceof Error ? value.message : `People could not be loaded.` } }
  }
  async function invite(user: TeamMemberRecord): Promise<void> {
    if (sendingId !== null) return
    sendingId = user.userId
    error = ``
    try { await onAdd(user)
      if (!disposed) onClose() }
    catch (value) { if (!disposed) error = value instanceof Error ? value.message : `The invitation could not be sent.` }
    finally { if (!disposed) sendingId = null }
  }
  onMount(() => {
    const restore = mountModalEnvironment(root, returnFocus)
    const key = (event: KeyboardEvent) => {
      if (event.key === `Escape`) onClose()
      containModalTab(event, dialog, document.activeElement)
    }
    window.addEventListener(`keydown`, key)
    root.querySelector<HTMLInputElement>(`input[type="search"]`)?.focus()
    void load()
    return () => { disposed = true
      window.removeEventListener(`keydown`, key)
      restore() }
  })
</script>

<div class="invite-member-modal" bind:this={root}>
  <button class="invite-member-modal__backdrop" type="button" aria-label="Close invite member" tabindex="-1" on:click={onClose}></button>
  <div class="invite-member-modal__dialog" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="invite-member-title" tabindex="-1">
    <header><h2 id="invite-member-title">Invite member</h2><IconButton icon="fa-xmark" ariaLabel="Close invite member" onClick={onClose} /></header>
    <SearchField label="Search people" placeholder="Name, Discord handle, or PlayFab ID" bind:value={query} />
    {#if error}<p role="alert">{error}</p>{#if !users.length}<Button label="Try again" onClick={() => void load()} />{/if}{/if}
    <div class="invite-member-modal__people">
      {#if loading || !loaded}<p role="status">Loading people...</p>
      {:else}{#each candidates as user (user.userId)}
        <button class="invite-member-modal__person" type="button" disabled={sendingId !== null} on:click={() => void invite(user)}>
          <AvatarUser src={user.avatarUrl} size={42} fallbackTone="muted" />
          <span><strong>{getAdminName(user)}</strong><small>@{user.username}</small><small>{user.playfabId ?? `No PlayFab ID`}</small></span>
        </button>
      {:else}{#if !error}<EmptyState title={query.trim() ? `No matches` : `No people available`} message={query.trim() ? `Try another name, Discord handle, or PlayFab ID.` : `Everyone available is already a member or has an invitation.`} />{/if}{/each}{/if}
    </div>
  </div>
</div>

<style lang="scss">
  .invite-member-modal { position: fixed; inset: 0; z-index: 35; display: grid; place-items: center; padding: var(--gutter-lg); }
  .invite-member-modal__backdrop { position: absolute; inset: 0; border: 0; border-radius: 0; background: rgba(2, 8, 13, 0.76); }
  .invite-member-modal__dialog { position: relative; box-sizing: border-box; width: min(600px, 100%); height: 70vh; max-height: 70vh; display: grid; grid-template-rows: auto auto auto minmax(0, 1fr); gap: var(--gutter-md); padding: var(--gutter-lg); overflow: auto; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); background: var(--color-dark-primary); box-shadow: var(--shadow); }
  header { display: flex; align-items: center; justify-content: space-between; }
  h2, p { margin: 0; }
  h2 { font-size: var(--font-size-xl); }
  .invite-member-modal__people { min-height: 0; overflow: auto; display: grid; align-content: start; gap: var(--gutter-sm); }
  .invite-member-modal__person { display: flex; align-items: center; gap: var(--gutter-md); border: 1px solid var(--color-dark-secondary); padding: var(--gutter-md); text-align: left; background: transparent; }
  .invite-member-modal__person > span { display: grid; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
  small, p { font-size: var(--font-size-sm); color: var(--color-light-tertiary); }
</style>
