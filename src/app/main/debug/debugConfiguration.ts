import type { ConsoleKeyCode } from '../../shared/consoleKey'
import type { DebugLayout, DebugPreset } from '../../shared/debug'
import { createDebugLayout, createDebugPresets, validateDebugLayout, validateDebugPreset } from '../../shared/debugPresets'
import { isRecord } from './debugSnapshot'

export type DebugSessionConfig = { version?: number, presets: DebugPreset[], layout: DebugLayout }
type Dependencies = {
  getConsoleKey(): ConsoleKeyCode | null
  loadConfig?(): unknown | Promise<unknown>
  saveConfig?(config: DebugSessionConfig): void | Promise<void>
}

export class DebugConfiguration {
  private custom = new Map<number, DebugPreset>()
  private pending: Promise<void> = Promise.resolve()
  layout = createDebugLayout()

  constructor(private readonly dependencies: Dependencies) {}

  presets(): DebugPreset[] {
    return createDebugPresets(this.dependencies.getConsoleKey()).map(preset => this.custom.get(preset.slot) ?? preset)
  }

  async initialize(): Promise<void> {
    const saved = await this.dependencies.loadConfig?.()
    if (saved === undefined || saved === null) return
    if (!isRecord(saved) || !Array.isArray(saved.presets) || saved.presets.length > 8) throw new RangeError(`Invalid debug configuration.`)
    const retained = saved.version === 2 ? saved.presets : saved.presets
      .filter(preset => isRecord(preset) && (preset.slot === 1 || preset.slot === 5))
      .map(preset => ({ ...preset, slot: preset.slot === 5 ? 2 : 1,
        ...(preset.slot === 5 ? { instruction: `Press 2 to start or stop. Each message increments [N]; restarting resets the count.` } : {}) }))
    const presets = retained.map(validateDebugPreset)
    const layout = validateDebugLayout(saved.layout)
    this.custom = new Map(presets.map(preset => [preset.slot, preset]))
    this.layout = layout
  }

  async savePreset(value: DebugPreset): Promise<void> {
    const preset = validateDebugPreset(value)
    await this.write(async () => {
      const presets = new Map(this.custom)
      presets.set(preset.slot, preset)
      await this.persist([...presets.values()], this.layout)
      this.custom = presets
    })
  }

  async resetPresets(): Promise<void> {
    await this.write(async () => {
      await this.persist([], this.layout)
      this.custom.clear()
    })
  }

  async configure(value: DebugLayout): Promise<void> {
    const layout = validateDebugLayout(value)
    await this.write(async () => {
      await this.persist([...this.custom.values()], layout)
      this.layout = layout
    })
  }

  private async persist(presets: DebugPreset[], layout: DebugLayout): Promise<void> {
    await this.dependencies.saveConfig?.(structuredClone({ version: 2, presets, layout }))
  }

  private async write(write: () => Promise<void>): Promise<void> {
    const previous = this.pending
    const current = (async () => {
      try { await previous } catch { /* The previous caller already received its error. */ }
      await write()
    })()
    this.pending = current
    await current
  }
}
