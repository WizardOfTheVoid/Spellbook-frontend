<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { DiscordQueuePage } from '@spellbook/shared/discordBroadcasts.js'
  import { authState } from '$lib/auth/user'
  import { unwrap } from '$lib/utils/apiResult'
  import Button from '$lib/components/ui/Button.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import { DiscordQueueController } from './discordQueueController'

  export let active = false
  const controller = new DiscordQueueController(
    async beforeId => unwrap<DiscordQueuePage>(await window.chivServer.admin.discord.queue(beforeId), `Could not load message queues.`),
    next => { state = next }
  )
  let state = controller.state
  $: if (controller.setContext($authState.user?.id ?? null, active)) void controller.load()
  onDestroy(() => controller.setContext(null, false))

  function date(value: string | null): string {
    return value ? new Date(value).toLocaleString() : `—`
  }
</script>

<section class="discord-queue" aria-label="Discord message queues" aria-busy={state.loading}>
  <div class="discord-queue__toolbar">
    <p>One delivery per Discord server, newest first. Refresh to see the latest delivery status.</p>
    <Button label={state.loading ? `Loading…` : `Refresh`} icon="fa-rotate" disabled={state.loading} onClick={() => void controller.load()} />
  </div>
  {#if state.error}<p class="discord-queue__error" role="alert">{state.error}</p>{/if}
  {#each state.deliveries as entry (entry.id)}
    <article class="discord-queue__entry">
      <header>
        <div><strong>{entry.title}</strong><p>{entry.guildName} <span>· {entry.guildId}</span></p></div>
        <span class="discord-queue__status" class:sent={entry.status === `sent`} class:issue={entry.status === `retrying` || entry.status === `blocked`}>{entry.status}</span>
      </header>
      <dl>
        <div><dt>Queued</dt><dd>{date(entry.createdAt)}</dd></div>
        <div><dt>Attempts</dt><dd>{entry.attempts}</dd></div>
        <div><dt>{entry.status === `sent` ? `Sent` : `Next attempt`}</dt><dd>{entry.status === `sent` ? date(entry.sentAt) : entry.status === `blocked` ? `Waiting for server configuration` : entry.status === `sending` ? `In progress` : date(entry.nextAttemptAt)}</dd></div>
      </dl>
      {#if entry.status === `blocked`}<p class="discord-queue__error">This Discord server is disabled or has no updates channel.</p>{/if}
      {#if entry.lastError}<p class="discord-queue__error">{entry.lastError}</p>{/if}
      <details>
        <summary>Message details</summary>
        <p class="discord-queue__message">{entry.description}</p>
        <dl><div><dt>Delivery</dt><dd>#{entry.id}</dd></div><div><dt>Batch</dt><dd>{entry.batchId}</dd></div><div><dt>Channel</dt><dd>{entry.channelId ?? `Not configured`}</dd></div></dl>
      </details>
    </article>
  {:else}
    {#if !state.error}<EmptyState title={state.loading ? `Loading message queues` : `No queued messages`} message={state.loading ? `Fetching Discord deliveries.` : `Messages will appear here after a broadcast is queued for a Discord server.`} />{/if}
  {/each}
  {#if state.nextBeforeId !== null}<Button label="Load more" icon="fa-chevron-down" disabled={state.loading} onClick={() => void controller.load(true)} />{/if}
</section>

<style lang="scss">
  .discord-queue { display: grid; align-content: start; gap: var(--gutter-md); }
  .discord-queue__toolbar, header { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-md); }
  p { margin: 0; }
  .discord-queue__toolbar p, dt, header p { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  .discord-queue__entry { display: grid; gap: var(--gutter-md); padding: var(--gutter-md); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); background: var(--color-dark-primary); overflow-wrap: anywhere; }
  header p { margin-top: calc(var(--gutter-sm) / 2); }
  .discord-queue__status { border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); padding: calc(var(--gutter-sm) / 2) var(--gutter-sm); text-transform: capitalize; white-space: nowrap; }
  .sent { color: var(--color-accent-secondary); }
  .issue, .discord-queue__error { color: var(--color-accent-tertiary); }
  dl { display: flex; flex-wrap: wrap; gap: var(--gutter-md) var(--gutter-lg); margin: 0; }
  dd { margin: calc(var(--gutter-sm) / 2) 0 0; }
  summary { cursor: pointer; font-size: var(--font-size-xs); }
  .discord-queue__message { white-space: pre-wrap; margin: var(--gutter-md) 0; }
</style>
