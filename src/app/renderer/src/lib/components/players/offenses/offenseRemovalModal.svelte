<script lang="ts">
  import { onMount } from 'svelte'
  import { authState } from '$lib/auth/user'
  import ConfirmModal from '$lib/components/ui/ConfirmModal.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import { actionLabel, actionServer, isActionBanActive } from '$lib/utils/playerActions'
  import { offenseRemoval } from './offenseRemovalState'
  import { loadOffenses, performOffenseAction, type OffenseOptions } from './offenseActions'

  let loaded: typeof $offenseRemoval = null
  let options: OffenseOptions = { actions: [], activeBans: [] }
  let selectedId = ``
  let busy = false
  let loading = false
  let error = ``
  let now = new Date()
  let userId = $authState.user?.id
  $: if (userId !== $authState.user?.id) {
    userId = $authState.user?.id
    offenseRemoval.set(null)
  }
  $: if ($offenseRemoval && loaded !== $offenseRemoval) void load($offenseRemoval)
  $: standalone = $offenseRemoval?.standalone || selectedId.startsWith(`without:`)
  $: serverBans = options.activeBans.filter((ban, index, bans) => bans.findIndex(item => item.gameServerId === ban.gameServerId) === index)
  $: choices = $offenseRemoval?.standalone
    ? serverBans
    : options.actions
  $: selected = [...choices, ...serverBans].find(action => action.id === Number(selectedId.replace(`without:`, ``)))
  $: active = selected && options.activeBans.some(ban => ban.id === selected.id) && isActionBanActive(selected, [], now)
  onMount(() => {
    const timer = setInterval(() => now = new Date(), 1000)
    return () => clearInterval(timer)
  })

  async function load(request: NonNullable<typeof $offenseRemoval>) {
    loaded = request
    loading = true
    error = ``
    options = { actions: [], activeBans: [] }
    try {
      const result = await loadOffenses(request.target.playerId)
      if (loaded !== request || $offenseRemoval !== request) return
      const filter = (action: { gameServerId: number | null }) => !request.target.gameServerId || action.gameServerId === request.target.gameServerId
      options = { actions: result.actions.filter(filter), activeBans: result.activeBans.filter(filter) }
      selectedId = String(request.actionId ?? (request.standalone ? options.activeBans[0]?.id : options.actions[0]?.id) ?? ``)
    } catch (reason) { error = reason instanceof Error ? reason.message : `Offenses could not be loaded.` }
    finally { if (loaded === request) loading = false }
  }

  async function submit(unban: boolean) {
    const request = $offenseRemoval
    if (!request || !selected || busy) return
    busy = true
    error = ``
    try {
      await performOffenseAction(request.target, selected, unban, !standalone)
      offenseRemoval.set(null)
    } catch (reason) { error = reason instanceof Error ? reason.message : `Offense action failed.` }
    finally { busy = false }
  }
</script>

{#if $offenseRemoval}
  <ConfirmModal title={$offenseRemoval.standalone ? `Unban without offense` : `Remove offense`}
    message={$offenseRemoval.target.name} icon="fa-flag" iconType="light" cancelLabel="Close" showConfirm={false}
    {busy} manageOverlayState onConfirm={() => {}} onCancel={() => { if (!busy) offenseRemoval.set(null) }}>
    {#if loading}<p>Loading offenses…</p>{:else}
      <Select label={$offenseRemoval.standalone ? `Server` : `Offense`} value={selectedId}
        options={[...choices.map(action => ({ value: String(action.id), label: $offenseRemoval?.standalone ? actionServer(action) : `${actionLabel(action)} - ${actionServer(action)} - #${action.id}` })),
          ...($offenseRemoval.target.profile && !$offenseRemoval.standalone ? serverBans.map(ban => ({ value: `without:${ban.id}`, label: `Unban without offense - ${actionServer(ban)}` })) : [])]}
        onChange={value => selectedId = value} />
      {#if !choices.length}<p>{$offenseRemoval.standalone ? `No active bans.` : `No offenses to remove.`}</p>{/if}
      <div class="offense-removal-actions">
        {#if active}<Button label={standalone ? `Unban without offense` : `Unban & remove offense`} variant="primary" disabled={busy} onClick={() => void submit(true)} />{/if}
        {#if !standalone}<Button label="Remove offense" disabled={busy || !selected} onClick={() => void submit(false)} />{/if}
      </div>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </ConfirmModal>
{/if}

<style>
  .offense-removal-actions { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); margin-top: var(--gutter-md); }
</style>
