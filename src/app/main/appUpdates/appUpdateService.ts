import type { AppUpdater } from 'electron-updater'
import type { AppUpdateState } from '../../shared/appUpdate'
import { spellbookDownloadUrl } from '@spellbook/shared/appLinks'

export type AppUpdateEngine = Pick<
  AppUpdater,
  | `autoDownload`
  | `autoInstallOnAppQuit`
  | `allowPrerelease`
  | `allowDowngrade`
  | `disableWebInstaller`
  | `logger`
  | `on`
  | `off`
  | `checkForUpdates`
  | `quitAndInstall`
>
type Options = {
  currentVersion: string
  updater: AppUpdateEngine | null
  openExternal: (url: string) => Promise<unknown>
  requireUpdate: () => Promise<void>
  prepareToQuit: () => Promise<void>
  restartApplication: () => Promise<void>
  onError?: (error: unknown) => void
  setInterval?: typeof setInterval
  clearInterval?: typeof clearInterval
  now?: () => number
}

const stableVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u

export class AppUpdateService {
  private state: AppUpdateState = {
    phase: `idle`,
    version: null,
    required: false,
    percent: null,
    error: null,
    restartRequired: false,
  }
  private readonly listeners = new Set<(state: AppUpdateState) => void>()
  private timer: ReturnType<typeof setInterval> | undefined
  private checking: Promise<void> | null = null
  private verifiedVersion: string | null = null
  private stopped = false
  private startupDeadline = 0

  constructor(private readonly options: Options) {
    const updater = options.updater
    if (!updater) return
    updater.autoDownload = true
    updater.autoInstallOnAppQuit = false
    updater.allowPrerelease = false
    updater.allowDowngrade = false
    updater.disableWebInstaller = true
    updater.logger = console
    updater.on(`update-available`, this.available)
    updater.on(`update-not-available`, this.unavailable)
    updater.on(`download-progress`, this.progress)
    updater.on(`update-downloaded`, this.downloaded)
    updater.on(`error`, this.failed)
  }

  start(): void {
    if (this.stopped || this.timer || !this.options.updater) return
    this.startupDeadline = this.now() + 5_000
    this.timer = (this.options.setInterval ?? setInterval)(() => {
      void this.check()
    }, 600_000)
    void this.check()
  }

  stop(): void {
    if (this.stopped) return
    this.stopped = true
    this.startupDeadline = 0
    const clearTimer = this.options.clearInterval ?? clearInterval
    clearTimer(this.timer)
    const updater = this.options.updater
    updater?.off(`update-available`, this.available)
    updater?.off(`update-not-available`, this.unavailable)
    updater?.off(`download-progress`, this.progress)
    updater?.off(`update-downloaded`, this.downloaded)
    updater?.off(`error`, this.failed)
    this.listeners.clear()
  }

  getState(): AppUpdateState {
    return { ...this.state }
  }

  subscribe(listener: (state: AppUpdateState) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async check(): Promise<string | null> {
    if (!this.options.updater || this.stopped || this.state.restartRequired) return this.state.version
    if (this.state.phase === `downloading` && !this.startupDeadline) return this.state.version
    if (!this.checking && this.state.phase !== `downloading`) {
      this.verifiedVersion = null
      this.update({ phase: `checking`, error: null, percent: null })
      this.checking = this.checkLatest()
    }
    if (this.checking)
      await this.bounded(this.checking, 5_000).catch((error) => {
        this.startupDeadline = 0
        if (this.state.phase !== `downloading`) this.failed(error)
      })
    return this.state.version
  }

  async openLatestRelease(): Promise<void> {
    await this.options.openExternal(spellbookDownloadUrl)
  }

  async restartAndInstall(): Promise<void> {
    if (
      !this.options.updater ||
      this.stopped ||
      this.checking ||
      this.state.phase !== `ready` ||
      this.state.restartRequired
    )
      return
    this.update({ phase: `installing`, restartRequired: true, error: null })
    try {
      await this.bounded(this.options.prepareToQuit(), 30_000)
      if (!this.stopped) this.options.updater.quitAndInstall(true, true)
    } catch (error) {
      this.failed(error)
    }
  }

  async restartApplication(): Promise<void> {
    if (this.stopped || !this.state.restartRequired || this.state.phase !== `error`) return
    this.update({ phase: `installing`, error: null })
    try {
      await this.bounded(this.options.restartApplication(), 30_000)
    } catch (error) {
      this.failed(error)
    }
  }

  private async checkLatest(): Promise<void> {
    // Yield once so even a synchronously rejecting engine shares the same in-flight job.
    await Promise.resolve()
    try {
      const result = await this.options.updater!.checkForUpdates()
      if (!result) throw new Error(`Update lookup returned no result`)
      if (result?.downloadPromise) void this.observeDownload(result.downloadPromise, result.updateInfo.version)
      if (this.startupDeadline && result.downloadPromise) {
        await this.bounded(result.downloadPromise, Math.max(0, this.startupDeadline - this.now())).catch(
          () => undefined,
        )
      }
    } catch (error) {
      this.failed(error)
    } finally {
      const installAtStartup = this.startupDeadline > this.now()
      this.startupDeadline = 0
      this.checking = null
      if (this.verifiedVersion && this.verifiedVersion === this.state.version && !this.state.restartRequired) {
        this.update({ phase: `ready`, percent: 100, error: null })
        if (installAtStartup) void this.restartAndInstall()
      }
    }
  }

  private async observeDownload(download: Promise<unknown>, version: string): Promise<void> {
    try {
      await download
    } catch (error) {
      if (version === this.state.version) this.failed(error)
    }
  }

  private available = (info: {
    version: string
    forceUpdate?: unknown
  }): void => {
    if (this.stopped || this.state.restartRequired) return
    if (!this.isNewer(info.version) || typeof info.forceUpdate !== `boolean`) {
      this.failed(new Error(`Invalid update version or policy: ${info.version}`))
      return
    }
    const required = this.state.required || info.forceUpdate
    const newlyRequired = required && !this.state.required
    this.update({ phase: `downloading`, version: info.version, required, percent: null, error: null })
    if (newlyRequired) void this.requireUpdate()
  }

  private async requireUpdate(): Promise<void> {
    // Authentication latches the requirement immediately; logout must not hold the update job open.
    try {
      await this.options.requireUpdate()
    } catch (error) {
      this.log(error)
    }
  }

  private unavailable = (): void => {
    if (!this.state.restartRequired)
      this.update({ phase: `idle`, version: this.state.required ? this.state.version : null, percent: null })
  }

  private progress = (info: { percent: number }): void => {
    if (this.state.phase === `downloading` && Number.isFinite(info.percent))
      this.update({ percent: Math.max(0, Math.min(100, info.percent)) })
  }

  private downloaded = (info: { version: string }): void => {
    if (
      this.stopped ||
      this.state.restartRequired ||
      this.state.phase !== `downloading` ||
      info.version !== this.state.version
    )
      return
    this.verifiedVersion = info.version
    if (!this.checking) this.update({ phase: `ready`, percent: 100, error: null })
  }

  private failed = (error: unknown): void => {
    this.verifiedVersion = null
    this.log(error)
    this.update({
      phase: `error`,
      error: this.state.restartRequired
        ? `SpellBook needs to restart before you can continue.`
        : `The update could not finish. Try again or open the download page.`,
    })
  }

  private update(next: Partial<AppUpdateState>): void {
    if (this.stopped) return
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) {
      try {
        listener(this.getState())
      } catch (error) {
        this.log(error)
      }
    }
  }

  private log(error: unknown): void {
    const log = this.options.onError ?? console.error
    log(error)
  }

  private isNewer(version: string): boolean {
    if (!stableVersion.test(version) || !stableVersion.test(this.options.currentVersion)) return false
    const current = this.options.currentVersion.split(`.`).map(Number)
    const parts = version.split(`.`).map(Number)
    return parts.some(
      (value, index) =>
        value > current[index]! && parts.slice(0, index).every((part, prior) => part === current[prior]),
    )
  }

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  private async bounded<T>(work: Promise<T>, milliseconds: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Update operation timed out after ${milliseconds}ms`)), milliseconds)
    })
    try {
      return await Promise.race([work, timeout])
    } finally {
      clearTimeout(timer)
    }
  }
}
