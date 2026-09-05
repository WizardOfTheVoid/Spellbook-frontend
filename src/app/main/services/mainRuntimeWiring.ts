import type { CoreCallResult } from '../types'

type SessionInvalidator = {
  invalidateSession(result: CoreCallResult): Promise<void>
}

type AuthStartup = {
  registerIpc(): void
  restoreSession(): Promise<void>
  initialAuthUrl?: string
  acceptProtocolUrl(value: string): Promise<boolean>
  createWindow(): void
  checkUpdates?(): Promise<unknown>
  handleSessionFailure(error: unknown): void
}

export function sessionInvalidationHandler(
  auth: SessionInvalidator
): (result: CoreCallResult) => Promise<void> {
  return result => auth.invalidateSession(result)
}

export async function initializeWindowBeforeAuth(startup: AuthStartup): Promise<void> {
  startup.registerIpc()
  startup.createWindow()
  if (startup.checkUpdates) {
    try {
      await startup.checkUpdates()
    } catch {
      // An unavailable release service must not prevent signing in.
    }
  }
  try {
    const protocolAccepted = startup.initialAuthUrl
      ? await startup.acceptProtocolUrl(startup.initialAuthUrl)
      : false
    if (!protocolAccepted) await startup.restoreSession()
  } catch (error) {
    startup.handleSessionFailure(error)
  }
}
