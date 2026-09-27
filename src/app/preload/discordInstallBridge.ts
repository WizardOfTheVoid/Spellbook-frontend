import type { DiscordInstallResult } from '../shared/discordInstall.js'

type Listener = (event: unknown, result: DiscordInstallResult) => void

export type DiscordInstallIpcRenderer = {
  on(channel: string, listener: Listener): void
  removeListener(channel: string, listener: Listener): void
}

export function createDiscordInstallBridge(ipc: DiscordInstallIpcRenderer) {
  return {
    onCompleted(callback: (result: DiscordInstallResult) => void): () => void {
      const listener: Listener = (_event, result) => callback(result)
      ipc.on(`discord:installCompleted`, listener)
      return () => ipc.removeListener(`discord:installCompleted`, listener)
    }
  }
}
