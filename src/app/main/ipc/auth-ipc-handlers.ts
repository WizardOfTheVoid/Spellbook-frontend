import { shell, type IpcMain } from 'electron'
import type { HttpClient } from '../api/http-client'
import type { AuthSessionStore } from '../services/auth-session-store'
import type { MainAuthState } from '../services/mainRuntimeCoordinator'
import type { CoreCallResult } from '../types'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import { appIdentity } from '@spellbook/shared/appIdentity'

type JsonRecord = Record<string, unknown>
type AuthStateListener = (state: MainAuthState) => void | Promise<void>
type OpenExternal = (url: string) => Promise<unknown>

const signedOutState = Object.freeze({
  authenticated: false,
  onboardingComplete: false
})

export class AuthIpcHandlers {
  private state: MainAuthState = signedOutState
  private readonly listeners = new Set<AuthStateListener>()
  private identityRevision = 0
  private operationTail = Promise.resolve()
  private pendingAccessFailure: CoreCallResult | null = null
  private approvalTimer: ReturnType<typeof setInterval> | null = null
  private approvalCheckRunning = false
  private updateRequired = false
  private startupInitialization: Promise<void> | null = null

  constructor(
    private readonly ipcMain: IpcMain,
    private readonly httpClient: HttpClient,
    private readonly sessions: AuthSessionStore,
    private readonly overlayWindow: OverlayWindowController,
    private readonly openExternal: OpenExternal = url => shell.openExternal(url),
    private readonly onSession: (userId: number | null) => void = () => undefined
  ) {}

  getState(): MainAuthState {
    return this.state
  }

  setStartupInitialization(initialization: Promise<void>): void {
    this.startupInitialization = initialization
  }

  subscribe(listener: AuthStateListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  register(): void {
    this.ipcMain.handle(`auth:help`, () => this.openExternal(`https://chivalry2.dev/discord`))
    this.ipcMain.handle(`auth:login`, () => this.runOrdinary(async revision => {
      this.pendingAccessFailure = null
      const result = await this.httpClient.getServer(`/auth/discord/start`)
      if (!this.isCurrent(revision)) return AuthIpcHandlers.staleRequestResult()

      const url = this.dataRecord(result)?.url
      if (result.ok && typeof url === `string` && url.trim()) {
        await this.openExternal(url)
        if (this.isCurrent(revision)) this.overlayWindow.hide()
      }
      return this.isCurrent(revision) ? result : AuthIpcHandlers.staleRequestResult()
    }))

    this.ipcMain.handle(`auth:session`, () => this.runOrdinary(async revision => {
      const pending = this.pendingAccessFailure
      if (pending) {
        this.pendingAccessFailure = null
        return pending
      }
      const result = await this.httpClient.getServer(`/auth/session`)
      return await this.applyValidation(result, revision)
        ? result
        : AuthIpcHandlers.staleRequestResult()
    }))

    this.ipcMain.handle(`auth:profile`, (_event, value: unknown) => this.runOrdinary(async revision => {
      const source = this.record(value)
      const result = await this.httpClient.patchServer(`/users/me/profile`, {
        displayName: source.displayName,
        playfabId: source.playfabId
      })
      return await this.applyValidation(result, revision)
        ? result
        : AuthIpcHandlers.staleRequestResult()
    }))

    this.ipcMain.handle(`auth:logout`, () => this.updateRequired ? this.updateRequiredResult() : this.logout())
  }

  private logout(): Promise<CoreCallResult> {
    const intent = this.beginIdentityIntent(true)
    return this.enqueue(intent.revision, AuthIpcHandlers.staleRequestResult, async () => {
      if (!await intent.stopped || !this.isCurrent(intent.revision)) {
        return AuthIpcHandlers.staleRequestResult()
      }

      let result: CoreCallResult
      try {
        result = await this.httpClient.postServer(`/auth/logout`, {})
      } catch (error) {
        if (!this.isCurrent(intent.revision)) return AuthIpcHandlers.staleRequestResult()
        throw error
      } finally {
        if (this.isCurrent(intent.revision)) await this.clearSession(intent.revision)
      }
      if (!this.isCurrent(intent.revision)) {
        return AuthIpcHandlers.staleRequestResult()
      }
      return result
    })
  }

  async requireUpdate(): Promise<void> {
    if (this.updateRequired) return
    this.updateRequired = true
    try {
      await this.logout()
    } catch {
      // Local logout still completes when the server is unreachable.
    } finally {
      this.overlayWindow.sendToCurrent(`auth:sessionChanged`, this.updateRequiredResult())
      this.overlayWindow.show()
    }
  }

  private updateRequiredResult(): CoreCallResult {
    return {
      ok: false,
      status: 403,
      statusText: `APP_UPDATE_REQUIRED`,
      data: null,
      error: { code: `APP_UPDATE_REQUIRED`, message: `Please update your SpellBook to the latest version` }
    }
  }

  async acceptProtocolUrl(value: string): Promise<boolean> {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      return false
    }
    if (url.protocol !== `${appIdentity.protocol}:` || url.username || url.password) return false
    if (url.hostname === `discord-install`) return this.acceptDiscordInstallUrl(url)
    if (url.hostname !== `auth`) return false
    if (this.updateRequired) {
      this.sendProtocolResult(this.updateRequiredResult())
      return true
    }

    const ticket = url.searchParams.get(`ticket`)
    if (!ticket) return false

    this.pendingAccessFailure = null
    const intent = this.beginIdentityIntent(true)
    await this.enqueue(intent.revision, () => undefined, async () => {
      if (!await intent.stopped || !this.isCurrent(intent.revision)) return

      const ticketResult = await this.httpClient.postServer(`/auth/ticket`, { ticket })
      if (!this.isCurrent(intent.revision)) return

      const token = this.dataRecord(ticketResult)?.token
      if (!ticketResult.ok || typeof token !== `string` || !token.trim()) {
        this.sendProtocolResult(ticketResult)
        return
      }

      if (!await this.saveSession(token, intent.revision)) return
      this.httpClient.setServerAuthToken(token)

      const sessionResult = await this.httpClient.getServer(`/auth/session`)
      if (!await this.applyValidation(sessionResult, intent.revision)) return
      this.sendProtocolResult(sessionResult)
    })
    return true
  }

  private acceptDiscordInstallUrl(url: URL): boolean {
    const status = url.searchParams.get(`status`)
    if (status !== `success` && status !== `error`) return false

    const teamValue = url.searchParams.get(`teamId`)
    const guildId = url.searchParams.get(`guildId`)
    const guildName = this.protocolText(url.searchParams.get(`guildName`), 100)
    const message = this.protocolText(url.searchParams.get(`message`), 255)
    const teamId = teamValue && /^\d+$/u.test(teamValue) && Number(teamValue) > 0
      ? Number(teamValue)
      : null
    const result = {
      status,
      ...(teamId ? { teamId } : {}),
      ...(guildId ? { guildId } : {}),
      ...(guildName ? { guildName } : {}),
      ...(message ? { message } : {})
    }
    const window = this.overlayWindow.getOrCreate()
    window.webContents.send(`discord:installCompleted`, result)
    this.overlayWindow.show()
    return true
  }

  restoreSession(): Promise<void> {
    if (this.updateRequired) return Promise.resolve()
    const intent = this.beginIdentityIntent(false)
    return this.enqueue(intent.revision, () => undefined, async () => {
      const token = await this.sessions.load()
      if (!this.isCurrent(intent.revision)) return

      this.httpClient.setServerAuthToken(token)
      if (!token.trim()) {
        await this.publish(signedOutState, intent.revision)
        return
      }

      const result = await this.httpClient.getServer(`/auth/session`)
      this.rememberAccessFailure(result)
      await this.applyValidation(result, intent.revision)
    })
  }

  invalidateSession(result: CoreCallResult): Promise<void> {
    if (this.updateRequired) return Promise.resolve()
    if (result.status !== 401) return Promise.resolve()

    const intent = this.beginIdentityIntent(true)
    return this.enqueue(intent.revision, () => undefined, async () => {
      if (!await intent.stopped || !this.isCurrent(intent.revision)) return
      if (!await this.clearSession(intent.revision)) return
      this.overlayWindow.sendToCurrent(`auth:sessionChanged`, result)
    })
  }

  private async applyValidation(result: CoreCallResult, revision: number): Promise<boolean> {
    if (!this.isCurrent(revision)) return false

    const state = this.validatedState(result)
    if (!await this.publish(state ?? signedOutState, revision)) return false
    if (state) this.onSession(Number(this.dataRecord(result)?.id))
    if (state) this.syncApprovalPolling(this.dataRecord(result)?.isActive === false)
    if (!state && (result.status === 401 || result.status === 403)) {
      this.syncApprovalPolling(false)
      return this.clearSession(revision)
    }
    return this.isCurrent(revision)
  }

  private async publish(state: MainAuthState, revision: number): Promise<boolean> {
    if (!this.isCurrent(revision)) return false

    const frozen = Object.freeze({ ...state })
    for (const listener of this.listeners) {
      await listener(frozen)
      if (!this.isCurrent(revision)) return false
    }

    this.state = frozen
    return true
  }

  private validatedState(result: CoreCallResult): MainAuthState | null {
    if (!result.ok) return null

    const user = this.dataRecord(result)
    const id = user?.id
    const onboardingComplete = user?.onboardingComplete
    if (!Number.isInteger(id) || Number(id) < 1 || typeof onboardingComplete !== `boolean`
      || typeof user?.isActive !== `boolean`) return null

    if (!user.isActive) return signedOutState
    return Object.freeze({ authenticated: true, onboardingComplete })
  }

  private syncApprovalPolling(pending: boolean): void {
    if (!pending) {
      if (this.approvalTimer) clearInterval(this.approvalTimer)
      this.approvalTimer = null
      return
    }
    if (this.approvalTimer) return
    this.approvalTimer = setInterval(() => { void this.checkApproval() }, 30_000)
    this.approvalTimer.unref()
  }

  private async checkApproval(): Promise<void> {
    if (this.approvalCheckRunning) return
    this.approvalCheckRunning = true
    try {
      await this.runOrdinary(async revision => {
        const result = await this.httpClient.getServer(`/auth/session`)
        if (result.ok || result.status === 401 || result.status === 403) {
          if (await this.applyValidation(result, revision)) {
            this.overlayWindow.sendToCurrent(`auth:sessionChanged`, result)
          }
        }
        return result
      })
    } catch {
      // Keep waiting through a temporary connection failure.
    } finally {
      this.approvalCheckRunning = false
    }
  }

  private async clearSession(revision: number): Promise<boolean> {
    if (!this.isCurrent(revision)) return false

    this.onSession(null)
    this.httpClient.setServerAuthToken(``)
    await this.sessions.clear()
    return this.isCurrent(revision)
  }

  private async saveSession(token: string, revision: number): Promise<boolean> {
    try {
      await this.sessions.save(token)
    } catch (error) {
      await this.sessions.clear()
      if (this.isCurrent(revision)) throw error
      return false
    }

    if (this.isCurrent(revision)) return true
    await this.sessions.clear()
    return false
  }

  private async runOrdinary(
    operation: (revision: number) => Promise<CoreCallResult>
  ): Promise<CoreCallResult> {
    if (this.startupInitialization) await this.startupInitialization
    if (this.updateRequired) return Promise.resolve(this.updateRequiredResult())
    const revision = this.identityRevision
    return this.enqueue(revision, AuthIpcHandlers.staleRequestResult, () => operation(revision))
  }

  private beginIdentityIntent(stopRuntime: boolean): {
    revision: number
    stopped: Promise<boolean>
  } {
    const revision = ++this.identityRevision
    this.onSession(null)
    this.syncApprovalPolling(false)
    this.httpClient.advanceServerAuthEpoch()
    return {
      revision,
      stopped: stopRuntime ? this.publish(signedOutState, revision) : Promise.resolve(true)
    }
  }

  private enqueue<T>(
    revision: number,
    stale: () => T,
    operation: () => Promise<T>
  ): Promise<T> {
    const queued = this.operationTail.then(() => (
      this.isCurrent(revision) ? operation() : stale()
    ))
    this.operationTail = queued.then(() => undefined, () => undefined)
    return queued
  }

  private isCurrent(revision: number): boolean {
    return revision === this.identityRevision
  }

  private sendProtocolResult(result: CoreCallResult): void {
    const window = this.overlayWindow.getOrCreate()
    window.webContents.send(`auth:sessionChanged`, result)
    this.overlayWindow.show()
  }

  private dataRecord(result: CoreCallResult): JsonRecord | null {
    const envelope = this.record(result.data)
    return this.recordOrNull(envelope.data)
  }

  private record(value: unknown): JsonRecord {
    return this.recordOrNull(value) ?? {}
  }

  private recordOrNull(value: unknown): JsonRecord | null {
    return typeof value === `object` && value !== null && !Array.isArray(value)
      ? value as JsonRecord
      : null
  }

  private protocolText(value: string | null, maxLength: number): string | null {
    const text = value?.trim()
    return text && text.length <= maxLength ? text : null
  }

  private rememberAccessFailure(result: CoreCallResult): void {
    const envelope = this.record(result.data)
    const code = this.record(envelope.error).code
    if (code === `ACCOUNT_AWAITING_APPROVAL` || code === `ACCOUNT_SUSPENDED`) {
      this.pendingAccessFailure = result
    }
  }

  private static staleRequestResult(): CoreCallResult {
    return {
      ok: false,
      status: 409,
      statusText: `STALE_AUTH_REQUEST`,
      data: null,
      error: {
        code: `STALE_AUTH_REQUEST`,
        message: `Please sign in again.`
      }
    }
  }
}
