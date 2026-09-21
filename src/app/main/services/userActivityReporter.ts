type Activity = { version: string, startup: boolean }

export class UserActivityReporter {
  private userId: number | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private revision = 0

  constructor(
    private readonly version: string,
    private readonly report: (activity: Activity) => Promise<{ ok: boolean }>
  ) {}

  update(userId: number | null): void {
    if (this.userId === userId) return
    this.userId = userId
    const revision = ++this.revision
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (userId === null) return

    let startup = true
    let running = false
    const pulse = async (): Promise<void> => {
      if (running || revision !== this.revision) return
      running = true
      try {
        if ((await this.report({ version: this.version, startup })).ok) startup = false
      } catch {
        // Retry at the next pulse after a temporary connection failure.
      } finally {
        running = false
      }
    }
    void pulse()
    this.timer = setInterval(() => { void pulse() }, 5 * 60 * 1000)
    this.timer.unref()
  }
}
