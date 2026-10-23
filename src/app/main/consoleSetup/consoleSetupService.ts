import { randomUUID } from 'node:crypto'
import { isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'
import { initialConsoleSetupState, uncheckedConsole, type ConsoleSetupState } from '../../shared/consoleSetup'
import { isKeyboardLayoutId, type KeyboardLayoutId } from '../../shared/keyboardLayout'
import type { CoreAction } from '../../shared/coreAction'
import type { HttpClient } from '../api/http-client'
import { ResponseParser } from '../api/response-parser'
import { ListPlayersSnapshotParser } from '../parsers/list-players-parser'
import { ValueReader } from '../parsers/value-reader'
import type { CoreCallResult } from '../types'
import type { ConsoleBindingProbe } from './consoleBindingProbe'
import { ConsoleBindingStore } from './consoleBindingStore'
import { ConsoleActionLayouts } from './consoleActionLayouts'

const settingsPath = `/chivalry2/gameusersettings/`
const verifiedBinding = { status: `passed`, message: `In-game console key verified` } as const

export class ConsoleSetupService {
  private state: ConsoleSetupState
  private readonly listeners = new Set<(state: ConsoleSetupState) => void>()
  private bindingRequest: Promise<boolean> | null = null
  private configurationRequest: Promise<boolean> | null = null
  private catalogRequest: Promise<ConsoleSetupState> | null = null
  private lifetime = new AbortController()
  private bindingRevision = 0
  private started = false
  private timer: ReturnType<typeof setInterval> | null = null
  private probeId: string | null = null
  private localLoaded = false
  private catalogAttempted = false
  private storageUnavailable = false
  private coreUpgradeRequired = false
  private recordedKey: ConsoleKeyCode | null = null
  private detectedLayout: KeyboardLayoutId | null = null
  private enabledVerified = false
  private bindingVerified = false

  constructor(
    private readonly http: Pick<HttpClient, `callCore`>,
    private readonly getConsoleKey: () => ConsoleKeyCode | null,
    private readonly probe: Pick<ConsoleBindingProbe, `run`>,
    private readonly verification = new ConsoleBindingStore(),
    private readonly saveConsoleKey: (key: ConsoleKeyCode) => Promise<void> = async () => { throw new Error(`Console key storage is unavailable.`) }
  ) { this.state = initialConsoleSetupState(this.key()) }

  async loadVerification(): Promise<void> {
    try { await this.verification.load(); this.storageUnavailable = false }
    catch { this.storageUnavailable = true }
    this.localLoaded = true
    this.bindingVerified = this.verification.get(this.key()) !== null
    this.publish({ binding: this.bindingVerified ? verifiedBinding : uncheckedConsole, legacySetup: this.verification.legacySetup })
    await this.refreshKeyboardLayouts()
  }

  async flushVerification(): Promise<void> { await this.verification.flush() }

  start(): void {
    if (this.started) return
    this.started = true
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController()
    this.settingsChanged()
    void this.checkConsoleEnabled().catch(() => undefined)
    void this.refreshKeyboardLayouts()
    this.timer = setInterval(() => { if (!this.bindingRequest) void this.refreshKeyboardLayouts() }, 5000)
    this.timer.unref?.()
  }

  stop(): void {
    this.started = false
    this.lifetime.abort()
    this.bindingRevision++
    this.probeId = null
    this.bindingRequest = null
    this.configurationRequest = null
    this.catalogRequest = null
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.enabledVerified = false
    this.bindingVerified = this.verification.get(this.key()) !== null
    this.publish({ enabled: uncheckedConsole, binding: this.bindingVerified ? verifiedBinding : uncheckedConsole, writing: false })
  }

  getState(): ConsoleSetupState { return this.state }
  subscribe(listener: (state: ConsoleSetupState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  settingsChanged(): void {
    if (this.key() === this.state.consoleKey) return
    this.bindingRevision++
    this.probeId = null
    this.recordedKey = null
    this.detectedLayout = null
    this.bindingVerified = this.verification.get(this.key()) !== null
    this.publish({ consoleKey: this.key(), binding: this.bindingVerified ? verifiedBinding : uncheckedConsole })
  }

  checkConsoleEnabled(): Promise<boolean> { return this.configuration(false) }
  enableConsole(): Promise<boolean> { return this.configuration(true) }

  async recordConsoleKey(key: ConsoleKeyCode): Promise<boolean> {
    if (!isConsoleKeyCode(key) || this.bindingRequest || this.state.writing) return false
    this.bindingRevision++
    try {
      await this.verification.revoke(key)
      this.bindingVerified = false
      this.recordedKey = null
      this.detectedLayout = null
      await this.saveConsoleKey(key)
      this.storageUnavailable = false
      this.recordedKey = key
      this.publish({ consoleKey: key, binding: uncheckedConsole })
      return true
    } catch (error) {
      this.storageUnavailable = true
      this.publish({ binding: { status: `unavailable`, message: message(error) } })
      return false
    }
  }

  async setConsoleLayout(layoutId: KeyboardLayoutId): Promise<boolean> {
    if (this.bindingRequest || this.state.setupRequired || !isKeyboardLayoutId(layoutId)
      || !this.state.layouts.some(layout => layout.id === layoutId.toUpperCase())) return false
    try {
      await this.verification.setOverride(this.key(), layoutId)
      this.storageUnavailable = false
      this.publish({})
      return true
    } catch (error) {
      this.publish({ binding: { status: `unavailable`, message: message(error) } })
      return false
    }
  }

  async refreshKeyboardLayouts(): Promise<ConsoleSetupState> {
    if (this.catalogRequest) return await this.catalogRequest
    const request = this.readLayouts()
    this.catalogRequest = request
    try { return await request }
    finally { if (this.catalogRequest === request) this.catalogRequest = null }
  }

  private async readLayouts(): Promise<ConsoleSetupState> {
    const signal = this.lifetime.signal
    try {
      const data = await this.read(`/v3/keyboard-layouts`, signal)
      if (data.capabilityVersion !== 1) { this.coreUpgradeRequired = true; throw new Error(`Update SpellBook Core to configure keyboard layouts.`) }
      if (!Array.isArray(data.installed) || !data.installed.every(layout => ValueReader.isRecord(layout)
        && isKeyboardLayoutId(layout.id) && typeof layout.displayName === `string`)) throw new Error(`Windows keyboard layouts are unavailable.`)
      this.coreUpgradeRequired = false
      this.publish({ layouts: data.installed.map(layout => ({ id: layout.id.toUpperCase(), displayName: layout.displayName })),
        layoutCatalogStatus: `ready`, restorationFault: ValueReader.isRecord(data.restorationFault) ? String(data.restorationFault.message ?? `Retry keyboard layout restoration.`) : null })
    } catch (error) {
      if (!signal.aborted) this.publish({ layoutCatalogStatus: `unavailable`, commandIssue: message(error) })
    } finally {
      if (!signal.aborted) { this.catalogAttempted = true; this.publish({}) }
    }
    return this.state
  }

  async retryKeyboardLayoutRestore(): Promise<boolean> {
    try { await this.read(`/v3/keyboard-layouts/restore`, this.lifetime.signal, `POST`); await this.refreshKeyboardLayouts(); return !this.state.restorationFault }
    catch (error) { this.publish({ restorationFault: message(error) }); return false }
  }

  async checkConsoleBind(_retry = false): Promise<boolean> {
    if (this.bindingRequest) return await this.bindingRequest
    const request = this.checkBinding()
    this.bindingRequest = request
    try { return await request }
    finally { if (this.bindingRequest === request) this.bindingRequest = null }
  }

  private async checkBinding(): Promise<boolean> {
    this.settingsChanged()
    const revision = this.bindingRevision
    const key = this.key()
    const signal = this.lifetime.signal
    const current = () => !signal.aborted && revision === this.bindingRevision && key === this.key()
    this.publish({ binding: { status: `checking`, message: `Checking console key…` } })
    try {
      try { await this.verification.clearOverride(key) }
      catch (error) { this.storageUnavailable = true; throw error }
      this.detectedLayout = null
      this.publish({})
      if (this.state.recordRequired) throw new Error(`Record your in-game console key before checking it.`)
      if (!await this.checkConsoleEnabled()) throw new Error(`Enable the in-game console before checking its key.`)
      await this.refreshKeyboardLayouts()
      if (this.state.layoutCatalogStatus !== `ready` || this.state.restorationFault) throw new Error(this.state.commandIssue ?? `Keyboard layouts are unavailable.`)
      const meta = await this.read(`/v2/meta/get`, signal)
      if (meta.gameRunning !== true) throw new Error(`Start Chivalry 2 to check the console key.`)
      if (!current()) return false
      const id = randomUUID()
      this.probeId = id
      const result = await this.probe.run(id, key, signal)
      if (!current()) return false
      const data = ValueReader.getEnvelopeData(result)
      const envelope = ValueReader.isRecord(result.data) ? result.data : null
      const layout = ValueReader.isRecord(data?.keyboardLayout) ? data.keyboardLayout : null
      if (isKeyboardLayoutId(layout?.id) && this.state.layouts.some(item => item.id === String(layout.id).toUpperCase()))
        this.detectedLayout = String(layout.id).toUpperCase()
      this.publish({})
      if (!result.ok || envelope?.requestId !== id || data?.status !== `completed` || data.sent !== true
        || !ListPlayersSnapshotParser.extract(result)?.rawText.trim() || !this.detectedLayout) {
        this.bindingVerified = false
        this.publish({ binding: { status: `failed`, message: ResponseParser.getCallErrorMessage(result, `The console key check did not pass. Check the key in Chivalry and try again.`) } })
        return false
      }
      try { await this.verification.markPassed({ key, layoutId: this.detectedLayout, checkedAt: new Date().toISOString() }) }
      catch (error) { this.storageUnavailable = true; throw error }
      if (!current()) { await this.verification.revoke(key); return false }
      this.storageUnavailable = false
      this.bindingVerified = true
      this.publish({ binding: verifiedBinding })
      return true
    } catch (error) {
      if (current()) this.publish({ binding: { status: `unavailable`, message: message(error) } })
      return false
    } finally {
      if (current()) this.probeId = null
    }
  }

  observeListPlayers(_result: CoreCallResult, _consoleKey: ConsoleKeyCode): void { this.settingsChanged() }

  allowAction(body: RequestInit[`body`]): boolean {
    this.settingsChanged()
    if (!this.state.commandsBlocked && !this.bindingRequest) return true
    if (!this.enabledVerified || !this.probeId || typeof body !== `string`) return false
    const action = ResponseParser.parseText(body)
    if (!ValueReader.isRecord(action) || action.id !== this.probeId || action.author !== `user` || action.priority !== `normal`
      || !Array.isArray(action.commands) || action.commands.length !== 1) return false
    const command = action.commands[0]
    return ValueReader.isRecord(command) && command.type === `console` && command.command === `ListPlayers`
      && command.consoleKey === this.key() && command.expectClipboard === true && command.keyboardLayoutId === `detect`
  }

  prepareAction(action: CoreAction): CoreAction { return ConsoleActionLayouts.prepare(action, this.state.selectedLayout, this.probeId) }

  private async configuration(write: boolean): Promise<boolean> {
    if (this.configurationRequest) {
      if (!write || this.state.writing) return this.configurationRequest
      await this.configurationRequest.catch(() => undefined)
      return this.configuration(true)
    }
    const request = this.readConfiguration(write)
    this.configurationRequest = request
    try { return await request }
    finally { if (this.configurationRequest === request) this.configurationRequest = null }
  }

  private async readConfiguration(write: boolean): Promise<boolean> {
    const signal = this.lifetime.signal
    this.publish({ writing: write, enabled: { status: `checking`, message: write ? `Enabling console…` : `Checking console setting…` },
      windowMode: { status: `checking`, message: `Checking window mode…` } })
    try {
      if (write) await this.read(`${settingsPath}?key=bConsoleEnabled&value=True`, signal, `PATCH`)
      const data = await this.read(settingsPath, signal)
      const sections = ValueReader.isRecord(data.sections) ? data.sections : null
      if (!sections) throw new Error(`Core returned invalid game settings.`)
      const section = sections[`/Script/TBL.TBLGameUserSettings`]
      const values = ValueReader.isRecord(section) ? section.bConsoleEnabled : undefined
      const enabled = Array.isArray(values) && values.length === 1 && values[0] === `True`
      const windowed = [`FullscreenMode`, `LastConfirmedFullscreenMode`].every(key => {
        const modes = ValueReader.isRecord(section) ? section[key] : undefined
        return Array.isArray(modes) && modes.length === 1 && [`1`, `2`].includes(modes[0])
      })
      this.publish({ enabled: {
        status: enabled ? `passed` : `failed`,
        message: enabled ? (write ? `Enabled in game settings. Restart the game if it was running.` : `Console enabled in game settings`)
          : values === undefined ? `Console is not enabled: bConsoleEnabled is missing.` : `Console is not enabled: bConsoleEnabled must be True.`
      }, windowMode: {
        status: windowed ? `passed` : `failed`,
        message: windowed ? `Windowed mode confirmed in game settings` : `Both FullscreenMode and LastConfirmedFullscreenMode must be 1 or 2.`
      } })
      return enabled
    } catch (error) {
      if (!signal.aborted) {
        const unavailable = { status: `unavailable`, message: message(error) } as const
        this.publish({ enabled: unavailable, windowMode: unavailable })
      }
      throw error
    } finally {
      if (!signal.aborted) this.publish({ writing: false })
    }
  }

  private async read(path: string, signal: AbortSignal, method = `GET`): Promise<Record<string, unknown>> {
    const result = await this.http.callCore(path, { method, signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]) })
    signal.throwIfAborted()
    const data = ValueReader.getEnvelopeData(result)
    if (!result.ok || !data || (ValueReader.isRecord(result.data) && result.data.ok === false)) {
      if (path === `/v3/keyboard-layouts` && result.status === 404) this.coreUpgradeRequired = true
      throw new Error(ResponseParser.getCallErrorMessage(result, `Core request failed.`))
    }
    return data
  }

  private key(): ConsoleKeyCode { return this.getConsoleKey() ?? `NumpadSubtract` }

  private publish(update: Partial<ConsoleSetupState>): void {
    if (update.enabled && update.enabled.status !== `checking`) this.enabledVerified = update.enabled.status === `passed`
    const binding = this.verification.get(this.key())
    const override = this.verification.getOverride(this.key())
    const selectedLayout = override ? { layoutId: override, source: `manual` as const }
      : this.detectedLayout || binding ? { layoutId: this.detectedLayout ?? binding!.layoutId, source: `detected` as const } : null
    this.state = { ...this.state, ...update, lastVerifiedBinding: binding, selectedLayout,
      setupLoaded: this.localLoaded && this.catalogAttempted,
      recordRequired: !binding && this.recordedKey !== this.key() }
    const missing = selectedLayout && this.state.layoutCatalogStatus === `ready` && !this.state.layouts.some(layout => layout.id === selectedLayout.layoutId)
    const setupReason = this.storageUnavailable ? `storageUnavailable` : this.coreUpgradeRequired ? `coreUpgradeRequired`
      : missing ? `layoutUnavailable` : !binding ? this.state.recordRequired ? `layoutMissing` : `keyUnverified` : null
    const setupRequired = setupReason !== null
    const commandsBlocked = !this.state.setupLoaded || setupRequired || !this.enabledVerified || !this.bindingVerified
      || this.state.layoutCatalogStatus !== `ready` || this.state.restorationFault !== null || this.state.binding.status === `checking`
    const commandIssue = this.state.restorationFault ?? (setupRequired ? `Complete console setup in Settings → Controls.`
      : !this.enabledVerified ? `Check the in-game console in Settings.` : !this.bindingVerified ? `Check the in-game console key in Settings.`
      : this.state.layoutCatalogStatus !== `ready` ? `Keyboard layouts are unavailable. Retry in Settings.` : null)
    this.state = { ...this.state, setupReason, setupRequired, commandsBlocked, commandIssue }
    for (const listener of this.listeners) listener(this.state)
  }
}

function message(error: unknown): string { return error instanceof Error ? error.message : `Console check failed. Try again.` }
