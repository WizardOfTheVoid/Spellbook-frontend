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
  try {
    const protocolAccepted = startup.initialAuthUrl
      ? await startup.acceptProtocolUrl(startup.initialAuthUrl)
      : false
    if (!protocolAccepted) await startup.restoreSession()
  } catch (error) {
    startup.handleSessionFailure(error)
  }
}
