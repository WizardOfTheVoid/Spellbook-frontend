<script lang="ts">
  import { onMount, tick } from 'svelte'
  import { teamLanguageCodes, type TeamSettings } from '@spellbook/shared/teamSettings'
  import type { TeamRecord } from '$lib/core'
  import { authState } from '$lib/auth/user'
  import { createTeamEditor } from './teamEditor'
  import { unsavedChanges } from '$lib/utils/unsavedChanges'
  import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
  import Button from '$lib/components/ui/Button.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import Toggle from '$lib/components/ui/Toggle.svelte'
  import MultiSelect from '$lib/components/ui/MultiSelect.svelte'
  import TeamVariablesEditor from './teamVariablesEditor.svelte'
  import DeleteTeamButton from '../DeleteTeamButton.svelte'
  import TeamManagementModal from '../TeamManagementModal.svelte'
  import TeamLogo from './teamLogo.svelte'
  import Tabs from '$lib/components/ui/tabs.svelte'
  import { variableErrors } from '@spellbook/shared/teamVariables'
  import { gameServerChanged } from '$lib/stores/gameServersStore'

  export let team: TeamRecord
  export let canEdit = false
  export let onChanged: () => Promise<void>
  export let onDeleted: (teamId: number) => Promise<void>
  const editor = createTeamEditor<TeamSettings>(() => window.chivServer.teams.settings(team.id), value => window.chivServer.teams.saveSettings(team.id, value))
  const languages = new Intl.DisplayNames([`en`], { type: `language` })
  const languageOptions = teamLanguageCodes.map(value => ({ value, label: languages.of(value) ?? value }))
  let tab = `general`
  let root: HTMLDivElement
  let logoError = ``
  let transferring = false
  $: canDelete = team.ownerUserId === $authState.user?.id
  $: canTransfer = canDelete || $authState.user?.isSuperadmin === true
  $: tabs = [
    { value: `general`, label: `General`, icon: `fa-gear` },
    { value: `variables`, label: `Variables`, icon: `fa-code` },
    ...(canTransfer ? [{ value: `ownership`, label: `Ownership`, icon: `fa-user-crown` }] : [])
  ]
  $: if (!tabs.some(item => item.value === tab)) tab = `general`
  $: variableError = variableErrors($editor.value?.variables ?? []).some(Boolean)
  onMount(() => {
    const unregister = unsavedChanges.register(() => $editor.busy || editor.dirty())
    void editor.load()
    return () => {
      unregister()
      editor.dispose()
    }
  })
  async function save() {
    if (variableError) {
      tab = `variables`
      await tick()
      root.querySelector<HTMLElement>(`[aria-invalid="true"]`)?.focus()
      return
    }
    if (!await editor.save()) return
    gameServerChanged()
    notifySuccess(`Team settings saved.`)
    try { await onChanged() }
    catch (error) { notifyError(error instanceof Error ? error.message : `Team data refresh failed.`) }
  }
  async function selectLogo(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ``
    if (!file) return
    logoError = ``
    if (![`image/png`, `image/svg+xml`].includes(file.type) || file.size > 128 * 1024) {
      logoError = `Use a PNG or SVG logo up to 128 KB.`
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ``
    for (const byte of bytes) binary += String.fromCharCode(byte)
    editor.change({ logo: `data:${file.type};base64,${btoa(binary)}` })
  }
</script>

<div bind:this={root} class="grid-stack gap-1">
  {#if $editor.error}<p role="alert">{$editor.error}</p>{/if}
  <div class="settings-actions">
    {#if canEdit}<Button label="Save settings" icon="fa-floppy-disk" variant="primary" disabled={$editor.busy || !editor.dirty()} onClick={() => void save()} />{/if}
    <Button label="Reload" icon="fa-rotate" disabled={$editor.busy} onClick={async () => { if (await unsavedChanges.canLeave()) await editor.load() }} />
  </div>
  {#if $editor.value}
    <Tabs items={tabs} value={tab} label="Team settings sections" onChange={value => tab = value}>
    {#if tab === `general`}
    <div class="settings-logo"><TeamLogo logo={$editor.value.logo} />
      {#if canEdit}<label>Logo (SVG or PNG)<input aria-label="Logo (SVG or PNG)" type="file" accept="image/png,image/svg+xml" disabled={$editor.busy} on:change={event => void selectLogo(event)} /></label><Button label="Remove logo" icon="fa-trash" disabled={$editor.busy || !$editor.value.logo} onClick={() => editor.change({ logo: null })} />{/if}
    </div>
    {#if logoError}<p role="alert">{logoError}</p>{/if}
    <Toggle label="Clan" checked={$editor.value.isClan} disabled={!canEdit || $editor.busy} onChange={isClan => editor.change({ isClan })} />
    <Input label={$editor.value.isClan ? `Clan Name` : `Team Name`} value={$editor.value.name} maxlength={100} disabled={!canEdit || $editor.busy} onChange={name => editor.change({ name })} />
    <Input label={$editor.value.isClan ? `Clan Tag` : `Team Tag`} value={$editor.value.tag} maxlength={32} disabled={!canEdit || $editor.busy} onChange={tag => editor.change({ tag })} />
    <MultiSelect label="Languages" value={$editor.value.languages} options={languageOptions} disabled={!canEdit || $editor.busy} onChange={languages => editor.change({ languages })} />
    {:else if tab === `variables`}
    <Input label="Discord URL" value={$editor.value.discordUrl} type="url" maxlength={255} disabled={!canEdit || $editor.busy} hint="[discord_url]" onChange={discordUrl => editor.change({ discordUrl })} />
    <TeamVariablesEditor variables={$editor.value.variables} disabled={!canEdit || $editor.busy} onChange={variables => editor.change({ variables })} />
    <div class="settings-prefixes">
      <Input label="Adminsay prefix" value="" disabled hint="Reserved" />
      <Input label="Serversay prefix" value="" disabled hint="Reserved" />
    </div>
    {:else if tab === `ownership`}
    <div class="settings-actions">
      {#if canTransfer}<Button label="Change ownership" icon="fa-user-crown" disabled={$editor.busy} onClick={async () => { if (await unsavedChanges.canLeave()) transferring = true }} />{/if}
      {#if canDelete}<DeleteTeamButton {team} {onDeleted} canLeave={() => unsavedChanges.canLeave()} />{/if}
    </div>
    {/if}
    </Tabs>
  {:else if $editor.busy}<p>Loading settings...</p>{/if}
</div>
{#if transferring}<TeamManagementModal {team} mode="ownership" {onChanged} onClose={() => transferring = false} />{/if}

<style>
  .settings-actions, .settings-logo { display: flex; align-items: center; flex-wrap: wrap; gap: var(--gutter-sm); }
  .settings-logo label { display: grid; gap: var(--gutter-sm); }
  .settings-prefixes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--gutter-md); }
</style>
