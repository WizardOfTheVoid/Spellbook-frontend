<script lang="ts">
	import { onDestroy } from 'svelte'
	import { getCoreApi, getServerApi, type PlayerAction } from '$lib/core'
	import EmptyState from '$lib/components/ui/EmptyState.svelte'
	import { CommandHistoryController } from '$lib/commandHistory/commandHistoryController'
  import { authState } from '$lib/auth/user'
  import { fetchPlayerProfile } from '$lib/utils/serverProfilesApi'
  import { parsePlayerAction } from '$lib/utils/playerActionsApi'
  import { unwrap } from '$lib/utils/apiResult'
  import PlayerActionDetail from '$lib/components/players/PlayerActionDetail.svelte'
  import Button from '$lib/components/ui/Button.svelte'

	export let active = false
	const controller = new CommandHistoryController(getCoreApi(), (next, error) => { state = next; loadError = error })
	let state = controller.state
	let loadError = ``
  let selectedAction: PlayerAction | null = null
  let actionError = ``
  let actionRequest = 0
  let viewer = $authState.user
  $: if (viewer !== $authState.user) {
    viewer = $authState.user
    selectedAction = null
    actionError = ``
    actionRequest++
  }
	const origins = { unknown: `Unknown`, pending: `Pending`, spellbook: `SpellBook`, external: `Outside SpellBook (inferred)` }
	const statuses = { inactive: `Inactive`, waiting: `Waiting for Chivalry 2`, monitoring: `Monitoring`, recovering: `Recovering history`, unavailable: `Read unavailable`, incompatible: `Core update required` }
	const time = (value: number | string | null) => value === null ? `—` : new Date(value).toLocaleTimeString()
	$: controller.setActive(active)
  onDestroy(() => { controller.setActive(false); actionRequest++ })

  async function showAction(command: string, id: number): Promise<void> {
    const target = /^\s*(?:BanById|KickById|UnbanById)\s+"?([A-Za-z0-9_-]{4,128})"?(?:\s|$)/iu.exec(command)?.[1]
    if (!target) return
    const request = ++actionRequest
    actionError = ``
    try {
      const profile = await fetchPlayerProfile(target)
      const action = profile.actions.find(action => action.id === id)
        ?? parsePlayerAction(await unwrap<unknown>(await getServerApi().playerActions.get(profile.player.id, id), `Action could not be loaded.`))
      if (request === actionRequest) selectedAction = action
    } catch {
      if (request === actionRequest) actionError = `Action could not be loaded.`
    }
  }
</script>

<section class="command-origin" aria-label="Command origin integration test">
	<header>
		<h2>Command origin <span>Experimental</span></h2>
		<p>Latest ten saved console commands, newest at the bottom. Monitoring continues while this tab is closed.</p>
		<p>Origin is inferred. Repeated commands, delayed saves and monitoring gaps can remain Unknown.</p>
	</header>
	<div class="command-origin__status">
		<span>{statuses[state.status]} · {state.rows.length} shown / {state.total} in history</span>
		<span>Last successful read: {time(state.updatedAtUtc)}</span>
	</div>
	{#if loadError || state.error}<p class="command-origin__error" role="alert">{loadError || state.error}</p>{/if}
	{#if state.resetReason}<p class="command-origin__note">{state.resetReason}</p>{/if}
  {#if state.reporting}
    <p>{state.reporting.pending} pending uploads · {state.reporting.evicted} pending observations evicted</p>
    {#if state.reporting.error}<p class="command-origin__error" role="alert">{state.reporting.error}</p>{/if}
  {/if}
	{#if state.rows.length}
		<div class="command-origin__table">
			<table>
				<thead><tr><th scope="col">#</th><th scope="col">Command</th><th scope="col">Arguments</th><th scope="col">Origin</th><th scope="col">Observed</th><th scope="col">Record</th></tr></thead>
				<tbody>
					{#each state.rows as row (row.id)}
            {@const report = state.reporting?.rows[String(row.id)]}
						<tr class:outside={row.origin === `external`}>
							<td>{row.index}</td>
							<td title={row.command}><code>{row.action || row.command}</code></td>
							<td class="command-origin__arguments">{row.info || `—`}</td>
							<td title={row.reason}>
								{origins[row.origin]}
								{#if row.submission}<small title={`Action ${row.submission.actionId} · command ${row.submission.commandIndex + 1}`}>{row.submission.author} · submitted {time(row.submission.submittedAtUtc)}</small>{/if}
							</td>
							<td>{time(row.observedAtUtc)}</td>
              <td title={report?.reason}>
                {#if report?.playerActionId}
                  <button type="button" on:click={() => void showAction(row.command, report.playerActionId!)}>Action #{report.playerActionId}</button>
                {:else}{report?.status ?? `—`}{/if}
              </td>
							</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<EmptyState title="No monitored console history" message={state.status === `waiting` ? `Start Chivalry 2 to establish a monitoring baseline.` : `Commands appear after a successful read of the local game history.`} />
	{/if}
  {#if actionError}<p class="command-origin__error" role="alert">{actionError}</p>{/if}
  {#if selectedAction}
    <PlayerActionDetail action={selectedAction} />
    <Button label="Close action" onClick={() => { selectedAction = null }} />
  {/if}
</section>

<style lang="scss">
	.command-origin { display: grid; gap: var(--gutter-lg); min-width: 0; }
	h2, p { margin: 0; }
	header { display: grid; gap: var(--gutter-sm); }
	h2 span { margin-left: var(--gutter-sm); color: var(--color-accent-tertiary); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
	p, .command-origin__status, small { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
	.command-origin__status { display: flex; flex-wrap: wrap; gap: var(--gutter-md); justify-content: space-between; }
	.command-origin__error { color: var(--color-accent-quaternary); }
	.command-origin__table { overflow-x: auto; border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); }
	table { width: 100%; border-collapse: collapse; text-align: left; font-size: var(--font-size-xs); }
	th, td { padding: var(--gutter-md); vertical-align: top; }
	th { color: var(--color-light-secondary); background: var(--color-dark-secondary); font-weight: var(--font-weight-medium); }
	td { border-top: 1px solid var(--color-dark-tertiary); }
	td:first-child { color: var(--color-light-secondary); }
	td:nth-child(2), td:last-child { white-space: nowrap; }
	.command-origin__arguments { width: 100%; white-space: pre-wrap; overflow-wrap: anywhere; }
	small { display: block; margin-top: var(--gutter-sm); white-space: nowrap; }
  button { color: var(--color-accent-primary); white-space: nowrap; cursor: pointer; }
	.outside { background: color-mix(in srgb, var(--color-accent-tertiary) 18%, var(--color-dark-primary)); }
	.outside td:nth-child(4) { color: var(--color-accent-tertiary); }
</style>
