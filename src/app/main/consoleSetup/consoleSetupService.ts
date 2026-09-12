import type { ConsoleKeyCode } from '../../shared/consoleKey'
import { initialConsoleSetupState, uncheckedConsole, consoleBindingIssue, type ConsoleSetupState } from '../../shared/consoleSetup'
import type { HttpClient } from '../api/http-client'
import { ResponseParser } from '../api/response-parser'
import { ListPlayersSnapshotParser } from '../parsers/list-players-parser'
import { ValueReader } from '../parsers/value-reader'
import type { CoreCallResult } from '../types'
import type { ListPlayersRefresh } from '../services/list-players-service'

const settingsPath = `/chivalry2/gameusersettings/`

export class ConsoleSetupService {
  private state: ConsoleSetupState
  private readonly listeners = new Set<(state: ConsoleSetupState) => void>()
  private bindingRequest: { key: ConsoleKeyCode, request: Promise<boolean> } | null = null
  private configurationRequest: Promise<boolean> | null = null
  private lifetime = new AbortController()
  private bindingRevision = 0
  private started = false
  private retryAvailable = false
  private enabledVerified = false
  private bindingVerified = false
  private bindingFailed = false

  constructor(
    private readonly http: Pick<HttpClient, `callCore`>,
    private readonly getConsoleKey: () => ConsoleKeyCode | null,
    private readonly refreshListPlayers: () => Promise<ListPlayersRefresh>
  ) {
    this.state = initialConsoleSetupState(getConsoleKey() ?? `NumpadSubtract`)
  }

  start(): void {
    if (this.started) return
    this.started = true
    this.settingsChanged()
    if (this.lifetime.signal.aborted) this.lifetime = new AbortController()
    void this.checkConsoleEnabled().catch(() => undefined)
  }

  stop(): void {
    this.started = false
    this.lifetime.abort()
    this.bindingRevision++
    this.bindingRequest = null
    this.configurationRequest = null
    this.publish(initialConsoleSetupState(this.key()))
  }

  getState(): ConsoleSetupState { return this.state }

  subscribe(listener: (state: ConsoleSetupState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  settingsChanged(): void {
    if (this.key() === this.state.consoleKey) return
    this.bindingRevision++
    this.retryAvailable = false
    this.publish({ consoleKey: this.key(), binding: uncheckedConsole })
  }

  checkConsoleEnabled(): Promise<boolean> { return this.configuration(false) }
  enableConsole(): Promise<boolean> { return this.configuration(true) }

  async checkConsoleBind(retry = false): Promise<boolean> {
    this.settingsChanged()
    if (this.bindingFailed && !retry) return false
    if (this.bindingRequest) {
      if (this.bindingRequest.key === this.key()) return this.bindingRequest.request
      await this.bindingRequest.request.catch(() => undefined)
      return this.checkConsoleBind(retry)
    }
    const request = this.checkBinding(retry)
    this.bindingRequest = { key: this.key(), request }
    try { return await request }
    finally { if (this.bindingRequest?.request === request) this.bindingRequest = null }
  }

  observeListPlayers(result: CoreCallResult, consoleKey: ConsoleKeyCode): void {
    this.settingsChanged()
    if (this.lifetime.signal.aborted || consoleKey !== this.key()) return
    const data = ValueReader.getEnvelopeData(result)
    const snapshot = ListPlayersSnapshotParser.extract(result)
    if (result.ok && data?.status === `completed` && data.sent === true && snapshot?.rawText.trim()) {
      this.publish({ binding: { status: `passed`, message: `In-game console key verified` } })
    } else if (errorCode(result) === `CLIPBOARD_TIMEOUT` && Number(data?.sentCommands) > 0) {
      this.publish({ binding: { status: `failed`, message: `Ensure SpellBook has set the correct in-game console key.` } })
    }
  }

  allowAction(body: RequestInit[`body`]): boolean {
    this.settingsChanged()
    if (!this.state.commandsBlocked) return true
    if (!this.enabledVerified || (!this.retryAvailable && (this.bindingFailed || this.state.binding.status === `checking`)) || typeof body !== `string`) return false
    const action = ResponseParser.parseText(body)
    const commands = ValueReader.isRecord(action) ? action.commands : null
    if (!Array.isArray(commands) || commands.length !== 1) return false
    const command = commands[0]
    if (!ValueReader.isRecord(command) || command.type !== `console` || command.command !== `ListPlayers`
      || command.consoleKey !== this.key() || command.expectClipboard !== true) return false
    this.retryAvailable = false
    return true
  }

  private async checkBinding(retry: boolean): Promise<boolean> {
    const revision = this.bindingRevision
    const signal = this.lifetime.signal
    this.publish({ binding: { status: `checking`, message: `Checking console key…` } })
    try {
      const enabled = retry || !this.enabledVerified ? await this.checkConsoleEnabled() : true
      signal.throwIfAborted()
      if (revision !== this.bindingRevision) throw new Error(`Console key changed. Check the new key.`)
      if (!enabled) {
        this.publish({ binding: { status: `unavailable`, message: `Enable the in-game console before checking its key.` } })
        return false
      }
      const meta = await this.read(`/v2/meta/get`, signal)
      if (meta.gameRunning !== true) throw new Error(`Start Chivalry 2 to check the console key.`)
      if (revision !== this.bindingRevision) throw new Error(`Console key changed. Check the new key.`)
      this.retryAvailable = true
      let refreshed = await this.refreshListPlayers()
      if (!signal.aborted && revision === this.bindingRevision && (
        (refreshed.consoleOutput && refreshed.consoleOutput.key !== this.key())
        || (this.retryAvailable && errorCode(refreshed.consoleOutput?.result ?? refreshed.result) === `CONSOLE_SETUP_REQUIRED`)
      )) {
        refreshed = await this.refreshListPlayers()
      }
      signal.throwIfAborted()
      if (revision !== this.bindingRevision) throw new Error(`Console key changed. Check the new key.`)
      this.publish({ binding: { status: `checking`, message: `Checking console key…` } })
      if (refreshed.consoleOutput) this.observeListPlayers(refreshed.consoleOutput.result, refreshed.consoleOutput.key)
      if (this.state.binding.status === `passed`) return true
      if (this.state.binding.status === `failed`) return false
      throw new Error(ResponseParser.getCallErrorMessage(refreshed.result, `Console check could not finish. Try again when the game is ready.`))
    } catch (error) {
      if (!signal.aborted && revision === this.bindingRevision) {
        this.publish({ binding: { status: `unavailable`, message: message(error) } })
      }
      throw error
    } finally {
      this.retryAvailable = false
    }
  }

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
      throw new Error(ResponseParser.getCallErrorMessage(result, `Core request failed.`))
    }
    return data
  }

  private key(): ConsoleKeyCode { return this.getConsoleKey() ?? `NumpadSubtract` }

  private publish(update: Partial<ConsoleSetupState>): void {
    if (update.enabled && update.enabled.status !== `checking`) this.enabledVerified = update.enabled.status === `passed`
    if (update.binding && update.binding.status !== `checking`) {
      this.bindingVerified = update.binding.status === `passed`
      if (update.binding.status !== `unavailable`) this.bindingFailed = update.binding.status === `failed`
    }
    this.state = { ...this.state, ...update, commandsBlocked: !this.enabledVerified || !this.bindingVerified }
    this.state = { ...this.state, commandIssue: !this.enabledVerified
      ? this.state.enabled.status === `failed` ? `In-game console is disabled. Check Settings.` : `Check in-game console in Settings.`
      : !this.bindingVerified ? this.bindingFailed ? consoleBindingIssue : `Check the in-game console key in Settings.` : null }
    for (const listener of this.listeners) listener(this.state)
  }
}

function errorCode(result: CoreCallResult): string | undefined {
  const envelope = ValueReader.isRecord(result.data) ? result.data : null
  return ValueReader.isRecord(envelope?.error) ? ValueReader.getString(envelope.error, `code`) ?? undefined : result.error?.code
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : `Console check failed. Try again.`
}
