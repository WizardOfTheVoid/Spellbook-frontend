export type AppUpdateState = {
  phase: `idle` | `checking` | `downloading` | `ready` | `installing` | `error`
  version: string | null
  required: boolean
  percent: number | null
  error: string | null
  restartRequired: boolean
}

export type AppUpdateApi = {
  checkForUpdate(): Promise<string | null>
  openUpdatePage(): Promise<void>
  getUpdateState(): Promise<AppUpdateState>
  onUpdateChanged(listener: (state: AppUpdateState) => void): () => void
  installUpdate(): Promise<void>
  restartApplication(): Promise<void>
}
