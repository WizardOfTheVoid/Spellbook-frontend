import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { isConsoleKeyCode, type ConsoleKeyCode } from '../../shared/consoleKey'

export class ConsoleVerificationStore {
  private readonly verifiedKeys = new Set<ConsoleKeyCode>()
  private pending: Promise<void> = Promise.resolve()

  constructor(private readonly path?: string) {}

  async load(): Promise<void> {
    if (!this.path) return
    this.verifiedKeys.clear()
    let content: string
    try { content = await readFile(this.path, `utf8`) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === `ENOENT`) return
      throw error
    }
    const record: unknown = JSON.parse(content)
    if (!isVerificationRecord(record)) throw new Error(`Invalid console verification record.`)
    for (const key of record.verifiedKeys) this.verifiedKeys.add(key)
  }

  has(key: ConsoleKeyCode): boolean { return this.verifiedKeys.has(key) }

  markPassed(key: ConsoleKeyCode): void {
    if (this.verifiedKeys.has(key)) return
    this.verifiedKeys.add(key)
    this.save()
  }

  revoke(key: ConsoleKeyCode): void {
    if (!this.verifiedKeys.delete(key)) return
    this.save()
  }

  flush(): Promise<void> { return this.pending }

  private save(): void {
    if (!this.path) return
    const path = this.path
    const content = `${JSON.stringify({ version: 1, verifiedKeys: [...this.verifiedKeys].sort() })}\n`
    this.pending = this.pending.catch(() => undefined).then(async () => {
      await mkdir(dirname(path), { recursive: true })
      const temporary = `${path}.tmp`
      await writeFile(temporary, content, `utf8`)
      await rename(temporary, path)
    })
    void this.pending.catch(error => console.error(`Console verification save failed.`, error))
  }
}

function isVerificationRecord(value: unknown): value is { version: 1, verifiedKeys: ConsoleKeyCode[] } {
  if (typeof value !== `object` || value === null || !(`version` in value) || !(`verifiedKeys` in value)) return false
  return value.version === 1 && Array.isArray(value.verifiedKeys) && value.verifiedKeys.every(isConsoleKeyCode)
}
