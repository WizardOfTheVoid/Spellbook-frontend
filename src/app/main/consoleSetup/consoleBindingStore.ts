import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'
import { isKeyboardLayoutId, type KeyboardLayoutId, type VerifiedConsoleBinding } from '../../shared/keyboardLayout'

type BindingRecord = { version: 2, bindings: VerifiedConsoleBinding[], overrides: { key: ConsoleKeyCode, layoutId: KeyboardLayoutId }[] }
const emptyRecord = (): BindingRecord => ({ version: 2, bindings: [], overrides: [] })

export class ConsoleBindingStore {
  legacySetup = false
  private record = emptyRecord()
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly path?: string) {}

  async load(): Promise<void> {
    if (!this.path) return
    this.record = emptyRecord()
    let content: string
    try { content = await readFile(this.path, `utf8`) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === `ENOENT`) return
      throw error
    }
    const value = JSON.parse(content)
    if (value?.version === 1 && Array.isArray(value.verifiedKeys) && value.verifiedKeys.every(isConsoleKeyCode)) { this.legacySetup = true; return }
    if (!validRecord(value)) throw new Error(`Invalid console binding record.`)
    this.record = {
      version: 2,
      bindings: value.bindings.map(binding => ({ ...binding, layoutId: binding.layoutId.toUpperCase() })),
      overrides: value.overrides.map(override => ({ ...override, layoutId: override.layoutId.toUpperCase() }))
    }
  }

  get(key: ConsoleKeyCode): VerifiedConsoleBinding | null {
    const binding = this.record.bindings.find(binding => binding.key === key)
    return binding ? { ...binding } : null
  }

  getOverride(key: ConsoleKeyCode): KeyboardLayoutId | null {
    return this.record.overrides.find(override => override.key === key)?.layoutId ?? null
  }

  async markPassed(binding: VerifiedConsoleBinding): Promise<void> {
    if (!validBinding(binding)) throw new Error(`Invalid console binding.`)
    await this.change(record => ({ ...record,
      bindings: [...record.bindings.filter(item => item.key !== binding.key), { ...binding, layoutId: binding.layoutId.toUpperCase() }],
      overrides: record.overrides.filter(item => item.key !== binding.key)
    }))
  }

  async setOverride(key: ConsoleKeyCode, layoutId: KeyboardLayoutId): Promise<void> {
    if (!isConsoleKeyCode(key) || !isKeyboardLayoutId(layoutId)) throw new Error(`Invalid keyboard layout.`)
    await this.change(record => {
      if (!record.bindings.some(binding => binding.key === key)) throw new Error(`Check the console key before selecting a layout.`)
      return { ...record, overrides: [...record.overrides.filter(item => item.key !== key), { key, layoutId: layoutId.toUpperCase() }] }
    })
  }

  async clearOverride(key: ConsoleKeyCode): Promise<void> {
    await this.change(record => ({ ...record, overrides: record.overrides.filter(item => item.key !== key) }))
  }

  async revoke(key: ConsoleKeyCode): Promise<void> {
    await this.change(record => ({ ...record, bindings: record.bindings.filter(item => item.key !== key), overrides: record.overrides.filter(item => item.key !== key) }))
  }

  async flush(): Promise<void> { await this.pending }

  private async change(update: (record: BindingRecord) => BindingRecord): Promise<void> {
    const previous = this.pending
    const operation = async () => {
      await previous.catch(() => undefined)
      const next = update(this.record)
      if (this.path) {
        await mkdir(dirname(this.path), { recursive: true })
        const temporary = `${this.path}.tmp`
        await writeFile(temporary, `${JSON.stringify(next)}\n`, `utf8`)
        await rename(temporary, this.path)
      }
      this.record = next
    }
    this.pending = operation()
    await this.pending
  }
}

function validBinding(value: unknown): value is VerifiedConsoleBinding {
  if (typeof value !== `object` || value === null) return false
  const binding = value as VerifiedConsoleBinding
  return isConsoleKeyCode(binding.key) && isKeyboardLayoutId(binding.layoutId)
    && typeof binding.checkedAt === `string` && Number.isFinite(Date.parse(binding.checkedAt))
}

function validRecord(value: unknown): value is BindingRecord {
  if (typeof value !== `object` || value === null) return false
  const record = value as BindingRecord
  if (record.version !== 2 || !Array.isArray(record.bindings) || !record.bindings.every(validBinding)
    || new Set(record.bindings.map(binding => binding.key)).size !== record.bindings.length || !Array.isArray(record.overrides)) return false
  return record.overrides.every(override => override && isConsoleKeyCode(override.key) && isKeyboardLayoutId(override.layoutId)
    && record.bindings.some(binding => binding.key === override.key))
    && new Set(record.overrides.map(override => override.key)).size === record.overrides.length
}
