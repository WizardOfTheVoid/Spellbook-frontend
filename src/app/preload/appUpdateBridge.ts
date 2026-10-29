import type { AppUpdateApi, AppUpdateState } from '../shared/appUpdate'

type Listener = (event: unknown, state: AppUpdateState) => void
type UpdateIpc = {
  invoke(channel: string): Promise<any>
  on(channel: string, listener: Listener): unknown
  removeListener(channel: string, listener: Listener): unknown
}

export function createAppUpdateBridge(ipc: UpdateIpc): AppUpdateApi {
  return {
    checkForUpdate: () => ipc.invoke(`app:update:check`),
    openUpdatePage: () => ipc.invoke(`app:update:open`),
    getUpdateState: () => ipc.invoke(`app:update:state`),
    installUpdate: () => ipc.invoke(`app:update:install`),
    restartApplication: () => ipc.invoke(`app:update:restart`),
    onUpdateChanged(callback) {
      const listener: Listener = (_event, state) => callback(state)
      ipc.on(`app:update:changed`, listener)
      return () => {
        ipc.removeListener(`app:update:changed`, listener)
      }
    },
  }
}
