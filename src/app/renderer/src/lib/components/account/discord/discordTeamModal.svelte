<script lang="ts">
  import { onMount } from 'svelte'
  import { getOverlayApi } from '$lib/core'
  import { unwrap } from '$lib/utils/apiResult'
  import { unsavedChanges } from '$lib/utils/unsavedChanges'
  import { containModalTab, mountModalEnvironment, ModalStateCoordinator } from '$lib/utils/quickActionUi'
  import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
  import Button from '$lib/components/ui/Button.svelte'
  import Icon from '$lib/components/ui/Icon.svelte'
  import IconButton from '$lib/components/ui/IconButton.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Tabs from '$lib/components/ui/tabs.svelte'
  import type { FormOption } from '$lib/types/ui'
  import { discordConfigurationFields, discordConfigurationLabels, type DiscordConfiguration, type DiscordConfigurationField, type DiscordGuildResources } from '@spellbook/shared/discordConfiguration'
  import { discordActionConnection, type DiscordConnectionState } from '../discordTeamConnection'
  import { DiscordConfigurationEditor } from './discordConfigurationEditor'

  export let teamId: number
  export let state: DiscordConnectionState
  export let busy = false
  export let returnFocus: HTMLButtonElement | null = null
  export let onConnect: () => void
  export let onDisconnect: () => void
  export let onClose: () => void

  let view = `connection`
  let mounted = false
  let loadedGuildId: string | null = null
  let root: HTMLDivElement
  let dialog: HTMLDivElement
  let closeButton: HTMLButtonElement | undefined
  let editor = new DiscordConfigurationEditor({
    configuration: async () => unwrap<DiscordConfiguration | null>(await window.chivServer.teams.discordConfiguration(teamId), `Could not load Discord configuration.`),
    resources: async () => unwrap<DiscordGuildResources>(await window.chivServer.teams.discordResources(teamId), `Could not load guild roles and channels.`),
    save: async input => unwrap<DiscordConfiguration | null>(await window.chivServer.teams.saveDiscordConfiguration(teamId, input), `Could not save Discord configuration.`)
  }, () => editor = editor)
  const modalState = new ModalStateCoordinator(open => getOverlayApi().setModalOpen(open))

  $: connection = discordActionConnection(state)
  $: working = busy || editor.saving
  $: tabs = [{ value: `connection`, label: `Connection` }, { value: `configuration`, label: `Configuration`, disabled: !connection, tooltip: !connection ? `Connect a Discord guild first.` : undefined }]
  $: if (mounted && (connection?.guildId ?? null) !== loadedGuildId) {
    loadedGuildId = connection?.guildId ?? null
    if (connection) void editor.load()
    else { editor.reset(); view = `connection` }
  }

  onMount(() => {
    mounted = true
    const cleanup = mountModalEnvironment(root, returnFocus)
    const stopDraft = unsavedChanges.register(() => editor.dirty)
    const stopVisibility = getOverlayApi().onVisibilityChange(visible => { if (!visible) void close() })
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || root.closest(`[inert]`)) return
      if (event.key === `Escape`) { event.preventDefault(); void close() }
      containModalTab(event, dialog, document.activeElement)
    }
    window.addEventListener(`keydown`, keydown)
    void syncModal(true)
    closeButton?.focus()
    return () => {
      mounted = false
      editor.dispose()
      stopDraft()
      stopVisibility()
      window.removeEventListener(`keydown`, keydown)
      cleanup()
      void syncModal(false)
    }
  })

  async function syncModal(open: boolean): Promise<void> {
    try { await modalState.set(open) }
    catch { notifyError(`Could not update the Discord dialog state.`) }
  }
  async function close(): Promise<void> {
    if (!working && await unsavedChanges.canLeave()) onClose()
  }
  async function disconnect(): Promise<void> {
    if (!working && await unsavedChanges.canLeave()) onDisconnect()
  }
  async function reload(): Promise<void> {
    if (!working && await unsavedChanges.canLeave()) await editor.load()
  }
  async function save(): Promise<void> {
    if (await editor.save()) notifySuccess(`Discord configuration saved.`)
  }
  function options(field: DiscordConfigurationField): FormOption[] {
    const values: FormOption[] = [{ value: ``, label: `None` }]
    if (field === `roleId`) values.push(...editor.resources.roles.map(role => ({ value: role.id, label: role.name })))
    else values.push(...editor.resources.channels.map(channel => ({ value: channel.id, group: channel.category, groupId: channel.categoryId,
      label: `#${channel.name}`, disabled: !channel.canSend })))
    const selected = editor.draft?.[field]
    if (selected && !values.some(option => option.value === selected)) values.push({ value: selected, label: `Unavailable (${selected})`, disabled: true })
    return values
  }
</script>

<div class="discord-modal" bind:this={root}>
  <button class="backdrop" type="button" aria-label="Close Discord" tabindex="-1" disabled={working} on:click={() => void close()}></button>
  <div class="dialog" bind:this={dialog} role="dialog" aria-modal="true" aria-labelledby="discord-title" tabindex="-1">
    <header>
      <Icon name="fa-discord" type="brands" size="xlg" />
      <h1 id="discord-title">Discord</h1>
      <IconButton icon="fa-xmark" ariaLabel="Close Discord" disabled={working} bind:element={closeButton} onClick={() => void close()} />
    </header>
    <Tabs items={tabs} value={view} label="Discord settings" fill onChange={value => view = value}>
      {#if view === `connection`}
        <div class="content">
          {#if connection}
            <h2>{connection.guildName}</h2>
            <p>To configure SpellBook inside discord, do <code>/sb-wizard</code> in your guild server or go to the Configuration tab.</p>
          {:else}
            <p>Click on connect to integrate SpellBook into your guild server, then do <code>/sb-wizard</code> in your guild server</p>
          {/if}
          {#if state.status === `linking`}<p>Complete the installation in your browser.</p>{/if}
          {#if state.status === `failed`}<p role="alert">{state.message}</p>{/if}
        </div>
      {:else}
        <div class="content">
          {#if editor.loading}<p>Loading guild roles and channels…</p>{/if}
          {#if editor.error}<p role="alert">{editor.error}</p>{/if}
          {#if editor.draft}
            {#each discordConfigurationFields as field}
              <Select label={discordConfigurationLabels[field]} options={options(field)} value={editor.draft[field] ?? ``}
                searchable disabled={working || editor.loading} onChange={value => editor.edit(field, value || null)}
                hint={field === `roleId` ? `Role members with this role can use most commands without a SpellBook account.` : null} />
            {/each}
          {/if}
          <Button label="Reload" disabled={working || editor.loading} onClick={() => void reload()} />
        </div>
      {/if}
    </Tabs>
    <footer>
      <Button label="Close" disabled={working} onClick={() => void close()} />
      {#if view === `connection`}
        <Button label={connection ? `Disconnect` : `Connect`} variant={connection ? `danger` : `primary`}
          disabled={working || state.status === `linking`} onClick={() => connection ? void disconnect() : onConnect()} />
      {:else}
        <Button label={editor.saving ? `Saving…` : `Save`} variant="primary" disabled={working || editor.loading || !editor.dirty} onClick={() => void save()} />
      {/if}
    </footer>
  </div>
</div>

<style lang="scss">
  .discord-modal { position: fixed; inset: 0; z-index: 35; display: grid; place-items: center; padding: var(--gutter-lg); }
  .backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgba(2, 8, 13, 0.76); }
  .dialog { position: relative; width: min(560px, 100%); height: 70vh; max-height: calc(100vh - 2 * var(--gutter-lg)); display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--gutter-lg); padding: var(--gutter-lg); border: 1px solid var(--color-dark-tertiary);
    border-radius: var(--radius-xl); background: var(--color-dark-primary); box-shadow: var(--shadow); }
  header, footer { display: flex; align-items: center; gap: var(--gutter-md); }
  header h1 { flex: 1; }
  footer { justify-content: space-between; }
  .content { min-height: 0; overflow: auto; display: grid; align-content: start; gap: var(--gutter-lg); padding: var(--gutter-xs); }
  h1, h2, p { margin: 0; }
  h1 { font-size: var(--font-size-2xl); }
  h2 { font-size: var(--font-size-md); }
  p { color: var(--color-light-secondary); line-height: 1.6; }
  [role="alert"] { color: var(--color-danger); }
</style>
