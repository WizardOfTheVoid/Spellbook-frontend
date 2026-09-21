<script lang="ts">
  import { onMount } from 'svelte'
  import type { DebugPanelLayout, DebugSessionSnapshot } from '../../../../../shared/debug'
  import DebugHudPanel from './debugHudPanel.svelte'

  export let data: DebugSessionSnapshot[`ruleset`]
  export let layout: DebugPanelLayout
  export let producerPaused = false
  let now = Date.now()
  onMount(() => {
    const timer = setInterval(() => now = Date.now(), 100)
    return () => clearInterval(timer)
  })
  $: snapshot = data?.snapshot
  $: serverNow = snapshot ? snapshot.serverTime + Math.max(0, now - (data?.receivedAt ?? now)) : now
  $: status = data?.error ? `UNAVAILABLE` : !snapshot ? `NO SERVER` : !snapshot.running ? `STOPPED` : snapshot.paused ? `PAUSED` : snapshot.error ? `ERROR` : `RUNNING`
  $: countdown = snapshot?.nextTickAt ? Math.max(0, snapshot.nextTickAt - serverNow) : null
</script>

<DebugHudPanel name="ruleset" title="RULESET" {status} {layout}>
  {#if data?.error}<p class="error">{data.error}</p>
  {:else if snapshot}
    <div class="line"><span>Next tick</span><strong>{snapshot.evaluating ? `Evaluating` : countdown === null ? `Stopped` : countdown > 0 ? `${(countdown / 1000).toFixed(1)}s` : `Waiting for tick`}</strong></div>
    <p class="muted">Server {snapshot.gameServerId} · {snapshot.rules.length} enabled rules · 5s scheduler</p>
    <p class="muted">Roster: {snapshot.rosterReceivedAt ? `${Math.max(0, Math.floor((serverNow - Date.parse(snapshot.rosterReceivedAt)) / 1000))}s old` : `unavailable`}</p>
    {#if snapshot.paused}<p class="warning">Production paused - resume in Admin → Actions.</p>{/if}
    {#if producerPaused}<p class="warning">This app’s action worker is paused in Debug.</p>{/if}
    {#if snapshot.error}<p class="error">{snapshot.error}</p>{/if}
    <div class="rules">
      {#each snapshot.rules as rule (rule.id)}
        <div class="rule">
          <div class="line"><strong>{rule.name}</strong><span class:success={rule.status === `Executed`}>{rule.status}</span></div>
          <small class="muted">{rule.profileName}</small>
          <p>{rule.reason}</p>
          {#if Object.keys(rule.outcomes).length}<p class="muted">{Object.entries(rule.outcomes).map(([status, count]) => `${count} ${status}`).join(` / `)}</p>{/if}
          {#if rule.cooldownUntil}<small class="muted">Next target eligible in {Math.max(0, Math.ceil((rule.cooldownUntil - serverNow) / 1000))}s</small>{/if}
          {#if rule.nextDueAt}<small class="muted">Interval due in {Math.max(0, Math.ceil((rule.nextDueAt - serverNow) / 1000))}s</small>{/if}
          {#if rule.lastRun}<p class="muted">Last run #{rule.lastRun.id}: {rule.lastRun.status}{rule.lastRun.message ? ` - ${rule.lastRun.message}` : ``}</p>{/if}
        </div>
      {:else}<p class="muted">No enabled rules attached to this claimed server.</p>{/each}
    </div>
  {:else}<p class="muted">Waiting for a current game server. Superadmin access is required.</p>{/if}
</DebugHudPanel>

<style>
  .line { display: flex; justify-content: space-between; gap: 12px; }
  .rules { display: grid; gap: 8px; max-height: 48vh; overflow: auto; margin-top: 10px; }
  .rule { border-top: 1px solid #d2e1ff30; padding-top: 8px; }
  p { margin: 4px 0; overflow-wrap: anywhere; }
  .muted { color: #8b9bb1; }
  .warning { color: #e8c67b; }
  .error { color: #f09696; }
  .success { color: #83deb2; }
</style>
