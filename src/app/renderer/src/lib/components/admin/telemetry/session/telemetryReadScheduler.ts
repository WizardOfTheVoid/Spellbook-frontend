export type CohortRequest = { workspaceId: `live` | `replay`, requestId: number }

/** A completed cohort is published only while its workspace and cursor are current. */
export class TelemetryReadScheduler<T extends CohortRequest, R> {
  private active = false
  private pending: T | null = null
  private running: T | null = null
  private generation = 0

  constructor(
    private readonly read: (request: T) => Promise<R>,
    private readonly publish: (request: T, result: R) => void,
    private readonly failed: (error: unknown, request: T) => void,
    private readonly cancel: (request: T) => Promise<unknown>
  ) {}

  setActive(active: boolean) {
    if (this.active === active) return
    this.active = active
    if (!active) {
      this.pending = null
      this.invalidate()
    } else void this.drain()
  }

  enqueue(request: T, replace = false) {
    if (!this.active) return
    this.pending = request
    if (replace) this.invalidate()
    void this.drain()
  }

  invalidate() {
    this.generation++
    if (this.running) void this.cancel(this.running).catch(() => {})
  }

  private async drain() {
    if (!this.active || this.running || !this.pending) return
    const request = this.pending
    const generation = this.generation
    this.pending = null
    this.running = request
    try {
      const result = await this.read(request)
      if (this.active && generation === this.generation) this.publish(request, result)
    } catch (error) {
      if (this.active && generation === this.generation) this.failed(error, request)
    } finally {
      this.running = null
      void this.drain()
    }
  }
}

export class TelemetrySnapshotCache<T> {
  private entries = new Map<string, { value: T, bytes: number }>()
  private bytes = 0

  constructor(private readonly maxEntries = 8, private readonly maxBytes = 8 * 1024 * 1024) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key)
    if (!entry) return
    this.entries.delete(key)
    this.entries.set(key, entry)
    return entry.value
  }

  set(key: string, value: T) {
    const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
    const previous = this.entries.get(key)
    if (previous) this.bytes -= previous.bytes
    this.entries.delete(key)
    if (bytes > this.maxBytes) return
    this.entries.set(key, { value, bytes })
    this.bytes += bytes
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.entries.entries().next().value!
      this.entries.delete(oldest[0])
      this.bytes -= oldest[1].bytes
    }
  }

  clear() {
    this.entries.clear()
    this.bytes = 0
  }
}
