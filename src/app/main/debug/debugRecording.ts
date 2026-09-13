type RecordingEntry = { timeMs: number, kind: string, data: unknown }

export class DebugRecording {
  private entries: RecordingEntry[] = []
  enabled = false

  constructor(private readonly now: () => number, private readonly limit: number) {}

  add(kind: string, data: unknown): void {
    if (!this.enabled) return
    this.entries.push({ timeMs: this.now(), kind, data: redact(data) })
    if (this.entries.length > this.limit) this.entries.splice(0, this.entries.length - this.limit)
  }

  export(settings: unknown): string {
    return JSON.stringify({ version: 1, exportedAt: this.now(), settings: redact(settings), entries: this.entries }, null, 2)
  }
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 20) return `[depth limit]`
  if (Array.isArray(value)) return value.slice(0, 1000).map(item => redact(item, depth + 1))
  if (value && typeof value === `object`) {
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
      key === `expectClipboard` || key === `restoreClipboard` || !/token|secret|password|authorization|clipboard|headers|^rawText$/iu.test(key))
      .map(([key, item]) => [key, redact(item, depth + 1)]))
  }
  return typeof value === `string` ? value.slice(0, 16384) : value
}
