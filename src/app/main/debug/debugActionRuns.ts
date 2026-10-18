import type { CoreAction, CoreAppTarget } from '../../shared/coreAction'
import type { DebugPreset, DebugRun } from '../../shared/debug'
import { validateDebugPreset } from '../../shared/debugPresets'
import { buildAction } from '../core/actionBuilder'
import type { CoreCallResult } from '../types'
import type { DebugRecording } from './debugRecording'
import { envelopeData, isRecord } from './debugSnapshot'

export type DebugTimers = { setTimeout(callback: () => void, milliseconds: number): unknown, clearTimeout(timer: unknown): void }
type ScheduledRun = { slot: number, remaining: DebugPreset[`repeat`], nextRunAt: number }
type Dependencies = {
  callCore(path: string, init?: RequestInit): Promise<CoreCallResult>
  appTarget(): CoreAppTarget
  now(): number
  timers: DebugTimers
  recording: DebugRecording
  runLimit: number
  publish(): void
  fail(error: unknown): void
}

export class DebugActionRuns {
  readonly history: DebugRun[] = []
  readonly scheduled = new Map<unknown, ScheduledRun>()
  private readonly previews = new Map<number, { signature: string, request: CoreAction }>()
  private readonly active = new Map<string, { run: DebugRun, controller: AbortController }>()
  private generation = 0

  constructor(private readonly dependencies: Dependencies) {}

  preview(value: DebugPreset): CoreAction {
    const preset = validateDebugPreset(value)
    const request = this.build(preset)
    this.previews.set(preset.slot, { signature: this.signature(preset), request })
    return structuredClone(request)
  }

  run(value: DebugPreset): void {
    const preset = validateDebugPreset(value)
    if (this.scheduled.size + this.active.size >= 100) throw new RangeError(`Stop current test work before scheduling more.`)
    const generation = this.generation
    let count = 0
    const submit = (remaining: DebugPreset[`repeat`]) => {
      if (generation !== this.generation) return
      this.submit(preset, ++count)
      if (remaining === `infinite` || remaining > 1) schedule(remaining === `infinite` ? remaining : remaining - 1, Math.max(1, preset.intervalMs))
      this.dependencies.publish()
    }
    const schedule = (remaining: DebugPreset[`repeat`], milliseconds: number) => {
      const timer = this.dependencies.timers.setTimeout(() => {
        this.scheduled.delete(timer)
        try { submit(remaining) } catch (error) { this.dependencies.fail(error) }
      }, milliseconds)
      this.scheduled.set(timer, { slot: preset.slot, remaining, nextRunAt: this.dependencies.now() + milliseconds })
    }
    if (preset.startDelayMs > 0) schedule(preset.repeat, preset.startDelayMs)
    else submit(preset.repeat)
    this.dependencies.recording.add(`scheduled`, preset)
  }

  isLooping(slot: number): boolean {
    return [...this.scheduled.values()].some(run => run.slot === slot && run.remaining === `infinite`)
  }

  cancel({ disconnected = false, slot }: { disconnected?: boolean, slot?: number } = {}): string[] {
    if (slot === undefined) this.generation++
    for (const [timer, run] of this.scheduled) {
      if (slot !== undefined && run.slot !== slot) continue
      this.dependencies.timers.clearTimeout(timer)
      this.scheduled.delete(timer)
    }
    if (slot === undefined) this.previews.clear()
    else this.previews.delete(slot)
    const ids: string[] = []
    for (const { run, controller } of this.active.values()) {
      if (slot !== undefined && run.slot !== slot) continue
      run.state = disconnected ? `disconnected` : `cancelling`
      if (disconnected) controller.abort()
      ids.push(run.id)
    }
    return ids
  }

  abortSubmission(id: string): void {
    const entry = this.active.get(id)
    if (!entry) return
    entry.run.state = `disconnected`
    entry.controller.abort()
  }

  private submit(preset: DebugPreset, count: number): void {
    if (this.active.size >= 100) throw new RangeError(`Too many outstanding test Actions.`)
    const preview = this.previews.get(preset.slot)
    const request = count === 1 && preview?.signature === this.signature(preset) ? preview.request : this.build(preset, count)
    this.previews.delete(preset.slot)
    const run: DebugRun = { id: request.id, slot: preset.slot, label: preset.label, startedAt: this.dependencies.now(), request, state: `submitted` }
    const controller = new AbortController()
    this.active.set(run.id, { run, controller })
    this.history.push(run)
    if (this.history.length > this.dependencies.runLimit) this.history.splice(0, this.history.length - this.dependencies.runLimit)
    this.dependencies.recording.add(`request`, request)
    void this.execute(run, controller)
  }

  private async execute(run: DebugRun, controller: AbortController): Promise<void> {
    try {
      const result = await this.dependencies.callCore(`/v3/actions`, { method: `POST`, body: JSON.stringify(run.request), signal: controller.signal })
      run.result = result
      const data = envelopeData(result)
      run.state = isRecord(data) && typeof data.status === `string` ? data.status : result.ok ? `completed` : controller.signal.aborted ? run.state : `failed`
      if (!result.ok && run.state === `failed`) this.dependencies.fail(result.error?.message ?? `Action request failed.`)
      this.dependencies.recording.add(`result`, { id: run.id, result })
    } catch (error) {
      run.state = controller.signal.aborted ? run.state : `failed`
      run.result = { error: error instanceof Error ? error.message : String(error) }
      this.dependencies.recording.add(`result`, { id: run.id, result: run.result })
      if (!controller.signal.aborted) this.dependencies.fail(error)
    } finally {
      this.active.delete(run.id)
      this.dependencies.publish()
    }
  }

  private build(preset: DebugPreset, count = 1): CoreAction {
    const commands = preset.commands.map((command, index) => {
      const result = command.type === `console` ? { ...command, command: command.command.replaceAll(`[N]`, `${count}`) } : command
      return index === 0 && preset.repeat !== 1 ? { ...result, delayMs: Math.max(result.delayMs ?? 0, preset.intervalMs) } : result
    })
    const action = buildAction(commands, this.dependencies.appTarget(), { author: preset.author, priority: preset.priority })
    if (preset.identity === `distinct`) action.key = `${action.key}:${action.id}`
    return action
  }

  private signature(preset: DebugPreset): string { return JSON.stringify({ preset, app: this.dependencies.appTarget() }) }
}
