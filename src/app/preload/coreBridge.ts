export type RuntimeIpcRenderer = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>
  on(channel: string, listener: (...args: unknown[]) => void): void
  removeListener(channel: string, listener: (...args: unknown[]) => void): void
}

export function createRuntimeCoreBridge(ipcRenderer: RuntimeIpcRenderer) {
  return {
    meta: () => ipcRenderer.invoke(`core:meta`),
    gameState: () => ipcRenderer.invoke(`core:gameState`),
    refreshGameState: () => ipcRenderer.invoke(`core:refreshGameState`),
    onGameStateChanged: (callback: (state: unknown) => void) => subscribe(ipcRenderer, `core:gameStateChanged`, callback),
    consoleSetupState: () => ipcRenderer.invoke(`core:consoleSetupState`),
    checkConsoleEnabled: () => ipcRenderer.invoke(`core:checkConsoleEnabled`),
    enableConsole: () => ipcRenderer.invoke(`core:enableConsole`),
    checkConsoleBind: (retry?: boolean) => ipcRenderer.invoke(`core:checkConsoleBind`, retry),
    onConsoleSetupStateChanged: (callback: (state: unknown) => void) =>
      subscribe(ipcRenderer, `core:consoleSetupStateChanged`, callback),
    currentGameSnapshot: () => ipcRenderer.invoke(`core:currentGameSnapshot`),
    refreshCurrentGameSnapshot: () => ipcRenderer.invoke(`core:refreshCurrentGameSnapshot`),
    sentinelState: () => ipcRenderer.invoke(`core:sentinelState`),
    setSentinelEnabled: (enabled: boolean) => ipcRenderer.invoke(`core:setSentinelEnabled`, { enabled }),
    onCurrentGameSnapshot: (callback: (snapshot: unknown) => void) =>
      subscribe(ipcRenderer, `core:currentGameSnapshotChanged`, callback),
    onSentinelStateChange: (callback: (state: unknown) => void) =>
      subscribe(ipcRenderer, `core:sentinelStateChanged`, callback)
  }
}

function subscribe(
  ipcRenderer: RuntimeIpcRenderer,
  channel: string,
  callback: (payload: unknown) => void
): () => void {
  const listener = (_event: unknown, payload: unknown) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}
