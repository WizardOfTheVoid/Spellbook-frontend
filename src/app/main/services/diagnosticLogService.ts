import { appendFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { DiagnosticLogEntry } from '../../shared/diagnosticLogs'
import { sanitizeDiagnosticMessage } from '../../shared/diagnosticLogFormatting'

type PendingEntry = { line: string; bytes: number }

export class DiagnosticLogService {
  private readonly currentPath: string
  private readonly previousPath: string
  private readonly queue: PendingEntry[] = []
  private pending: Promise<void> | null = null
  private initialized = false
  private currentBytes = 0
  private windowStartedAt = 0
  private windowEntries = 0
  private writeFailed = false

  constructor(
    private readonly directory: string,
    private readonly maxFileBytes = 512 * 1024,
    private readonly now: () => number = Date.now,
  ) {
    this.currentPath = join(directory, `current.log`)
    this.previousPath = join(directory, `previous.log`)
  }

  write(source: `main` | `renderer`, entry: DiagnosticLogEntry): void {
    const timestamp = this.now()
    if (timestamp - this.windowStartedAt >= 10_000) {
      this.windowStartedAt = timestamp
      this.windowEntries = 0
    }
    if (++this.windowEntries > 200 || this.queue.length >= 200) return
    const line = `${JSON.stringify({
      timestamp: new Date(timestamp).toISOString(),
      source,
      level: entry.level,
      message: sanitizeDiagnosticMessage(entry.message),
    })}\n`
    const bytes = Buffer.byteLength(line)
    if (bytes > this.maxFileBytes) return
    this.queue.push({ line, bytes })
    this.pending ??= this.drain()
  }

  async flush(): Promise<void> {
    await this.pending
    if (this.writeFailed) throw new Error(`Diagnostic logs could not be written.`)
  }

  async exportTo(destination: string): Promise<void> {
    const target = resolve(destination).toLowerCase()
    if ([this.currentPath, this.previousPath].some(path => resolve(path).toLowerCase() === target)) {
      throw new Error(`Choose a separate file for the log export.`)
    }
    await this.flush()
    const previous = await this.readLog(this.previousPath)
    const current = await this.readLog(this.currentPath)
    await writeFile(destination, `${previous}${current}`, { encoding: `utf8`, mode: 0o600 })
  }

  private async drain(): Promise<void> {
    try {
      if (!this.initialized) {
        await mkdir(this.directory, { recursive: true })
        try {
          this.currentBytes = (await stat(this.currentPath)).size
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== `ENOENT`) throw error
        }
        this.initialized = true
      }
      while (this.queue.length) {
        const entry = this.queue.shift()!
        if (this.currentBytes + entry.bytes > this.maxFileBytes) {
          await rm(this.previousPath, { force: true })
          await rename(this.currentPath, this.previousPath)
          this.currentBytes = 0
        }
        await appendFile(this.currentPath, entry.line, { encoding: `utf8`, mode: 0o600 })
        this.currentBytes += entry.bytes
      }
      this.writeFailed = false
    } catch {
      this.queue.length = 0
      this.initialized = false
      this.writeFailed = true
    } finally {
      this.pending = null
    }
  }

  private async readLog(path: string): Promise<string> {
    try {
      return await readFile(path, `utf8`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === `ENOENT`) return ``
      throw error
    }
  }
}
