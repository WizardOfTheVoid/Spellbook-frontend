import assert from 'node:assert/strict'
import test from 'node:test'
import { createDiscordInstallBridge, type DiscordInstallIpcRenderer } from './discordInstallBridge'

test(`Discord install listener forwards exact outcomes and removes its own listener`, () => {
  const listeners = new Map<string, (...values: unknown[]) => void>()
  const removed: unknown[] = []
  const ipc = {
    on: (channel: string, listener: (...values: unknown[]) => void) => { listeners.set(channel, listener) },
    removeListener: (channel: string, listener: (...values: unknown[]) => void) => {
      removed.push({ channel, listener })
    }
  } as DiscordInstallIpcRenderer
  const results: unknown[] = []
  const stop = createDiscordInstallBridge(ipc).onCompleted(result => results.push(result))
  const listener = listeners.get(`discord:installCompleted`)

  listener?.({}, {
    status: `success`,
    teamId: 8,
    guildId: `456`,
    guildName: `KRT Discord`
  })
  stop()

  assert.deepEqual(results, [{
    status: `success`,
    teamId: 8,
    guildId: `456`,
    guildName: `KRT Discord`
  }])
  assert.deepEqual(removed, [{ channel: `discord:installCompleted`, listener }])
})
