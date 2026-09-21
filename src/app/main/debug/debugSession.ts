import type { RulesetDebugSnapshot } from '@spellbook/shared/rulesets/ruleDiagnostics'
import { DebugRulesetStream } from './debugRulesetStream'
import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { CoreAction, CoreAppTarget } from '../../shared/coreAction'
import type { CoreDebugSnapshot, DebugLayout, DebugPreset, DebugProducer, DebugQueueOperation, DebugSessionSnapshot } from '../../shared/debug'
import { validateDebugPreset } from '../../shared/debugPresets'
import type { CoreCallResult } from '../types'
import { DebugRecording } from './debugRecording'
import { envelopeData, isRecord, readDebugSettings } from './debugSnapshot'
import { DebugConfiguration, type DebugSessionConfig } from './debugConfiguration'
import { DebugActionRuns, type DebugTimers } from './debugActionRuns'
import { DebugPollStream, type DebugPollRevision } from './debugPollStream'

export type { DebugSessionConfig } from './debugConfiguration'
export type DebugSessionDependencies = {
  http: { callCore(path: string, init?: RequestInit): Promise<CoreCallResult> }
  appTarget(): CoreAppTarget
  getConsoleKey(): ConsoleKeyCode | null
  getRulesetStatus?(): Promise<RulesetDebugSnapshot | null>
  getAppCpuPercent?(): number | null
  setProducerPaused(producer: DebugProducer, paused: boolean): void | Promise<void>
  publish(snapshot: DebugSessionSnapshot): void
  loadConfig?(): unknown | Promise<unknown>
  saveConfig?(config: DebugSessionConfig): void | Promise<void>
  now?(): number
  timers?: DebugTimers
  pollIntervalMs?: number
  eventLimit?: number
  runLimit?: number
}

const producers: DebugProducer[] = [`listPlayers`, `actions`, `antiAfk`]

export class DebugSession {
  private readonly timers
  private readonly now
  private readonly eventLimit: number
  private readonly recording: DebugRecording
  private readonly configuration: DebugConfiguration
  private readonly actions: DebugActionRuns
  private readonly poll: DebugPollStream
  private readonly rulesetStream: DebugRulesetStream | null
  private readonly cleanupIds = new Set<string>()
  private readonly producerRevision = new Map<DebugProducer, number>()
  private readonly producerIntent = new Map<DebugProducer, boolean>()
  private state: DebugSessionSnapshot
  private runGeneration = 0
  private armRevision = 0
  private settingsRevision = 0
  private cursor = 0
  private shortcutFloor = 0
  private connected = false
  private ownsPause = false
  private changedSettings = false
  private needsDisarm = false
  private connectionError: string | null = null

  constructor(private readonly dependencies: DebugSessionDependencies) {
    this.timers = dependencies.timers ?? {
      setTimeout: (callback: () => void, milliseconds: number) => setTimeout(callback, milliseconds),
      clearTimeout: (timer: unknown) => clearTimeout(timer as NodeJS.Timeout)
    }
    this.now = dependencies.now ?? Date.now
    this.eventLimit = bounded(dependencies.eventLimit, 500, 10, 10000)
    this.recording = new DebugRecording(this.now, this.eventLimit)
    this.configuration = new DebugConfiguration(dependencies)
    this.actions = new DebugActionRuns({ callCore: (path, init) => dependencies.http.callCore(path, init),
      appTarget: dependencies.appTarget, now: this.now, timers: this.timers, recording: this.recording,
      runLimit: bounded(dependencies.runLimit, 100, 1, 10000), publish: () => this.publish(), fail: error => this.fail(error) })
    this.poll = new DebugPollStream({ callCore: (path, init) => dependencies.http.callCore(path, init),
      cursor: () => this.cursor, revision: () => ({ arm: this.armRevision, settings: this.settingsRevision }), timers: this.timers,
      intervalMs: bounded(dependencies.pollIntervalMs, 100, 10, 1000),
      receive: (core, revision, isCurrent) => this.receive(core, revision, isCurrent), unavailable: error => this.disconnected(error) })
    this.rulesetStream = dependencies.getRulesetStatus ? new DebugRulesetStream(dependencies.getRulesetStatus, this.timers, this.now,
      ruleset => {
        this.state.ruleset = ruleset
        this.publish()
      }) : null
    this.state = { enabled: false, hudVisible: false, armed: false, recording: false, selectedSlot: null,
      presets: this.configuration.presets(), layout: this.configuration.layout,
      pausedProducers: { listPlayers: false, actions: false, antiAfk: false }, core: null, runs: [], events: [], error: null }
  }

  async initialize(): Promise<void> {
    try {
      await this.configuration.initialize()
      this.publish()
    } catch (error) { this.fail(error) }
  }

  async getState(): Promise<DebugSessionSnapshot> { return this.snapshot() }

  async setEnabled(enabled: boolean): Promise<void> {
    if (typeof enabled !== `boolean`) throw new RangeError(`Enabled must be boolean.`)
    if (this.state.enabled === enabled) return
    this.state.enabled = enabled
    this.state.hudVisible = enabled
    this.connected = false
    this.state.core = null
    this.state.armed = false
    this.armRevision++
    this.publish()
    this.rulesetStream?.setEnabled(enabled)
    await this.poll.setEnabled(enabled)
    if (!enabled) {
      this.needsDisarm = true
      await this.stop()
    }
  }

  toggleHud(): void {
    if (!this.state.enabled) return
    this.state.hudVisible = !this.state.hudVisible
    this.publish()
  }

  async setArmed(armed: boolean): Promise<void> {
    if (typeof armed !== `boolean`) throw new RangeError(`Armed must be boolean.`)
    if (armed) this.requireEnabled()
    const revision = ++this.armRevision
    if (!armed) this.state.armed = false
    let result: unknown
    try {
      result = await this.mutate(`/v3/debug/session`, { enabled: armed })
      if (!isRecord(result) || typeof result.armed !== `boolean` || !Number.isSafeInteger(result.sequence) || (result.sequence as number) < 0) throw new Error(`Invalid Core arm acknowledgment.`)
    } catch (error) {
      this.state.armed = false
      this.needsDisarm = true
      this.fail(error)
      throw error
    }
    if (revision !== this.armRevision || (armed && !this.state.enabled)) {
      this.state.armed = false
      this.armRevision++
      this.needsDisarm = true
      await this.cleanup()
      return
    }
    this.state.armed = armed && result.armed
    this.shortcutFloor = result.sequence as number
    this.needsDisarm = false
    this.publish()
  }

  async preview(value: DebugPreset): Promise<CoreAction> {
    return this.actions.preview(value)
  }

  async run(slot: number): Promise<void> {
    this.requireEnabled()
    if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new RangeError(`Slot must be 1 to 4.`)
    const preset = validateDebugPreset(this.configuration.presets().find(preset => preset.slot === slot))
    this.state.selectedSlot = slot
    try {
      if (this.actions.isLooping(slot)) {
        const ids = this.actions.cancel({ slot })
        for (const id of ids) this.cleanupIds.add(id)
        for (const id of ids) await this.cancelAction(id)
      } else this.actions.run(preset)
    } finally { this.publish() }
  }

  async stop(): Promise<void> {
    this.runGeneration++
    for (const id of this.actions.cancel()) this.cleanupIds.add(id)
    await this.releaseProducers()
    try { await this.cleanup() }
    finally { this.publish() }
  }

  async queue(operation: DebugQueueOperation, id?: string): Promise<void> {
    this.requireEnabled()
    if (![`pause`, `resume`, `step`, `cancel`, `stop`].includes(operation)) throw new RangeError(`Invalid queue operation.`)
    if (operation === `cancel` && (typeof id !== `string` || !id.trim() || id.length > 96)) throw new RangeError(`An Action id is required.`)
    const generation = this.runGeneration
    const pausing = operation === `pause` || operation === `step`
    if (pausing) this.ownsPause = true
    try {
      await this.mutate(`/v3/debug/queue`, { operation, ...(id === undefined ? {} : { id }) })
      if (operation === `resume`) this.ownsPause = false
    } finally {
      if (pausing) this.ownsPause = true
      if (generation !== this.runGeneration) await this.cleanup()
    }
    this.publish()
  }

  async setProducerPaused(producer: DebugProducer, paused: boolean): Promise<void> {
    if (!producers.includes(producer) || typeof paused !== `boolean`) throw new RangeError(`Invalid producer suspension.`)
    if (paused) this.requireEnabled()
    const revision = (this.producerRevision.get(producer) ?? 0) + 1
    this.producerRevision.set(producer, revision)
    this.producerIntent.set(producer, paused)
    try {
      await this.dependencies.setProducerPaused(producer, paused)
      if (this.producerRevision.get(producer) !== revision || (paused && !this.state.enabled)) {
        await this.dependencies.setProducerPaused(producer, this.state.enabled && (this.producerIntent.get(producer) ?? false))
        return
      }
      this.state.pausedProducers[producer] = paused
      this.recording.add(`producer`, { producer, paused })
      this.publish()
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  async settings(values: Record<string, number>, save = false, reset = false): Promise<void> {
    this.requireEnabled()
    if (!isRecord(values) || Object.keys(values).length > 32 || !Object.values(values).every(value => typeof value === `number` && Number.isInteger(value) && value >= 0 && value <= 2147483647) || typeof save !== `boolean` || typeof reset !== `boolean`) throw new RangeError(`Settings must contain bounded numeric values.`)
    const generation = this.runGeneration
    this.changedSettings = true
    let acknowledged = false
    try {
      const effective = readDebugSettings(await this.mutate(`/v3/debug/settings`, { values, save, reset }, `PATCH`))
      this.settingsRevision++
      if (generation === this.runGeneration && this.state.core) this.state.core = { ...this.state.core, settings: effective }
      acknowledged = true
    } catch (error) {
      this.fail(error)
      throw error
    } finally {
      this.changedSettings = !acknowledged || (!reset && !save)
      if (generation !== this.runGeneration) await this.cleanup()
    }
    this.publish()
  }

  async savePreset(value: DebugPreset): Promise<void> {
    await this.configureAndPublish(() => this.configuration.savePreset(value))
  }

  async resetPresets(): Promise<void> {
    await this.configureAndPublish(() => this.configuration.resetPresets())
  }

  async configure(value: DebugLayout): Promise<void> {
    await this.configureAndPublish(() => this.configuration.configure(value))
  }

  async record(enabled: boolean): Promise<void> {
    if (typeof enabled !== `boolean`) throw new RangeError(`Recording must be boolean.`)
    this.state.recording = enabled
    this.recording.enabled = enabled
    this.recording.add(`settings`, this.recordedSettings())
    this.publish()
  }

  async mark(label: string): Promise<void> {
    if (typeof label !== `string` || !label.trim() || label.length > 200) throw new RangeError(`Marker must contain 1 to 200 characters.`)
    this.recording.add(`marker`, { label })
  }

  async exportRecording(): Promise<string> { return this.recording.export(this.recordedSettings()) }

  private async receive(core: CoreDebugSnapshot, revision: DebugPollRevision, isCurrent: () => boolean): Promise<void> {
    if (revision.arm !== this.armRevision && core.sequence < this.cursor) return
    const freshConnection = !this.connected || core.sequence < this.cursor
    const floor = freshConnection ? core.sequence : this.cursor
    this.connected = true
    if (freshConnection) {
      this.state.armed = false
      this.armRevision++
      this.shortcutFloor = core.sequence
      if (core.armed) this.needsDisarm = true
    }
    if (freshConnection || this.needsDisarm) await this.cleanup()
    if (!isCurrent()) return
    if (!freshConnection && revision.settings !== this.settingsRevision && this.state.core) core = { ...core, settings: this.state.core.settings }
    this.state.core = core
    if (revision.arm === this.armRevision) this.state.armed = this.state.armed && core.armed
    const events = core.events.filter(event => event.sequence > floor).sort((a, b) => a.sequence - b.sequence)
    this.cursor = core.sequence
    if (core.eventsLost) this.recording.add(`journalGap`, { after: floor, sequence: core.sequence })
    let seen = floor
    for (const event of events) {
      if (event.sequence <= seen) continue
      seen = event.sequence
      this.state.events.push(event)
      this.recording.add(`event`, event)
      if (event.kind === `shortcut` && event.sequence > this.shortcutFloor && this.state.armed && Number.isInteger(event.slot) && event.slot! >= 1 && event.slot! <= 4) {
        try { await this.run(event.slot!) } catch (error) { this.fail(error) }
      }
    }
    this.trim(this.state.events, this.eventLimit)
    if (this.state.enabled && !this.state.armed) await this.setArmed(true)
    if (this.state.error === this.connectionError) this.state.error = null
    this.connectionError = null
    this.publish()
  }

  private async disconnected(error: unknown): Promise<void> {
    this.connected = false
    this.state.core = null
    this.state.armed = false
    this.armRevision++
    this.needsDisarm = true
    this.runGeneration++
    for (const id of this.actions.cancel({ disconnected: true })) this.cleanupIds.add(id)
    await this.releaseProducers()
    this.connectionError = message(error)
    this.fail(error)
  }

  private async mutate(path: string, body: unknown, method = `POST`): Promise<unknown> {
    try {
      this.recording.add(`controlRequest`, { path, method, body })
      const result = await this.dependencies.http.callCore(path, { method, body: JSON.stringify(body) })
      this.recording.add(`controlResult`, { path, result })
      if (!result.ok || (isRecord(result.data) && result.data.ok === false)) throw new Error(result.error?.message ?? (isRecord(result.data) && isRecord(result.data.error) && typeof result.data.error.message === `string` ? result.data.error.message : `Core debug request failed (${result.status}).`))
      return envelopeData(result)
    } catch (error) {
      this.fail(error)
      throw error
    }
  }

  private async cleanup(): Promise<void> {
    const errors: unknown[] = []
    const attempt = async (call: () => Promise<void>) => { try { await call() } catch (error) { errors.push(error) } }
    if (this.needsDisarm) await attempt(async () => {
      await this.mutate(`/v3/debug/session`, { enabled: false })
      this.needsDisarm = false
    })
    for (const id of this.cleanupIds) await attempt(() => this.cancelAction(id))
    if (this.ownsPause) await attempt(async () => {
      await this.mutate(`/v3/debug/queue`, { operation: `resume` })
      this.ownsPause = false
    })
    if (this.changedSettings) await attempt(async () => {
      await this.mutate(`/v3/debug/settings`, { reset: true }, `PATCH`)
      this.changedSettings = false
    })
    if (errors.length) throw errors[0]
  }

  private async cancelAction(id: string): Promise<void> {
    try {
      await this.mutate(`/v3/debug/queue`, { operation: `cancel`, id })
      this.cleanupIds.delete(id)
    } catch (error) {
      this.actions.abortSubmission(id)
      throw error
    }
  }

  private async releaseProducers(): Promise<void> {
    for (const producer of producers) {
      this.producerRevision.set(producer, (this.producerRevision.get(producer) ?? 0) + 1)
      this.producerIntent.set(producer, false)
      if (!this.state.pausedProducers[producer]) continue
      try {
        await this.dependencies.setProducerPaused(producer, false)
        this.state.pausedProducers[producer] = false
      } catch (error) { this.fail(error) }
    }
  }

  private async configureAndPublish(configure: () => Promise<void>): Promise<void> {
    try {
      await configure()
      this.publish()
    }
    catch (error) {
      this.fail(error)
      throw error
    }
  }

  private requireEnabled(): void { if (!this.state.enabled) throw new Error(`Enable Debug before running test controls.`) }
  private snapshot(): DebugSessionSnapshot { return structuredClone({ ...this.state, presets: this.configuration.presets(), layout: this.configuration.layout,
    appCpuPercent: this.state.enabled ? this.dependencies.getAppCpuPercent?.() ?? null : null,
    runs: this.actions.history, scheduled: [...this.actions.scheduled.values()] }) }
  private publish(): void { this.dependencies.publish(this.snapshot()) }
  private fail(error: unknown): void {
    this.state.error = message(error)
    this.publish()
  }
  private recordedSettings(): unknown { return { presets: this.configuration.presets(), layout: this.configuration.layout, core: this.state.core?.settings, pausedProducers: this.state.pausedProducers } }
  private trim<T>(items: T[], limit: number): void { if (items.length > limit) items.splice(0, items.length - limit) }
}

function bounded(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  return Number.isInteger(value) && value! >= minimum && value! <= maximum ? value! : fallback
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error) }
