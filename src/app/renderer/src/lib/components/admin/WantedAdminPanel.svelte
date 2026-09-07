<script lang="ts">
  import { onDestroy } from 'svelte'
  import { authState } from '$lib/auth/user'
  import Button from '$lib/components/ui/Button.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
  import {
    WantedAdminController,
    type WantedAdminState
  } from './wantedAdminController'

  export let active = false

  let playfabId = ''
  let state: WantedAdminState = { running: null }
  const controller = new WantedAdminController(undefined, next => { state = next })

  $: controller.setContext($authState.user?.id ?? null, active)

  onDestroy(() => controller.destroy())

  async function run(action: 'mock' | 'revert'): Promise<void> {
    const outcome = action === 'mock'
      ? await controller.runMock(playfabId)
      : await controller.runRevert(playfabId)
    if (!outcome) return
    if (outcome.ok) notifySuccess(outcome.message)
    else notifyError(outcome.message, { dedupeKey: `admin:wanted:${action}` })
  }
</script>

<section class="wanted-admin">
  <div>
    <h2>Wanted tools</h2>
    <p>
      Mock follows the real Wanted lifecycle, but only sends the configured Adminsay when executed.
    </p>
  </div>

  {#if $authState.user && !$authState.user.wantedCreationEnabled}
    <div class="wanted-admin__warning" role="status">
      Wanted creation is disabled for your account. Existing Wanted players will still be autobanned.
    </div>
  {/if}

  <Input
    label="PlayFab ID"
    value={playfabId}
    placeholder="Enter a PlayFab ID"
    icon="fa-gamepad"
    disabled={state.running !== null}
    onChange={value => { playfabId = value }}
  />

  <div class="wanted-admin__actions">
    <Button
      label={state.running === 'mock' ? 'Creating…' : 'Cheater ban (mock)'}
      icon="fa-flask"
      variant="primary"
      disabled={state.running !== null || !$authState.user?.wantedCreationEnabled}
      onClick={() => void run('mock')}
    />
    <Button
      label={state.running === 'revert' ? 'Reverting…' : 'Revert wanted'}
      icon="fa-rotate-left"
      disabled={state.running !== null}
      onClick={() => void run('revert')}
    />
  </div>
</section>

<style lang="scss">
  .wanted-admin {
    display: grid;
    align-content: start;
    gap: var(--gutter-lg);
  }

  h2,
  p {
    margin: 0;
  }

  p {
    margin-top: var(--gutter-sm);
    color: var(--color-light-secondary);
    font-size: var(--font-size-xs);
  }

  .wanted-admin__actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--gutter-md);
  }

  .wanted-admin__warning {
    border: 1px solid var(--color-accent-tertiary);
    border-radius: var(--radius);
    padding: var(--gutter-md);
    color: var(--color-light-secondary);
    background: rgbaa(var(--color-accent-tertiary), 0.08);
    font-size: var(--font-size-xs);
  }
</style>
