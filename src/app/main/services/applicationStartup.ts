import type { CoreConnection } from '../core/coreConnection'

type ApplicationStartupOptions = {
  isPackaged: boolean
  startCore(): Promise<CoreConnection>
  setCoreConnection(connection: CoreConnection): void
  registerIpc(): void
  createWindow(): void
  beginAuthentication?(): void
  startMonitor(): void
  startTray(): void
  reportFatalError(message: string, error: unknown): void
}

export async function startApplication(options: ApplicationStartupOptions): Promise<void> {
  try {
    if (options.isPackaged) {
      options.setCoreConnection(await options.startCore())
    }
    options.registerIpc()
    options.createWindow()
    options.beginAuthentication?.()
    options.startMonitor()
    options.startTray()
  } catch (error) {
    options.reportFatalError(`SpellBook could not start its local Core service.`, error)
    throw error
  }
}