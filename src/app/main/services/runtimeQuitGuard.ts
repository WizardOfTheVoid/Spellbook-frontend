type QuitEvent = {
  preventDefault(): void
}

export class RuntimeQuitGuard {
  private ready = false
  private stopping = false
  private preparation: Promise<void> | null = null

  async prepareToQuit(): Promise<void> {
    if (this.stopping) throw new Error(`Application quit already requested`)
    await this.prepare()
    if (this.stopping) throw new Error(`Application quit superseded preparation`)
  }

  constructor(
    private readonly stopRuntime: () => Promise<void>,
    private readonly cleanup: () => void,
    private readonly requestQuit: () => void,
    private readonly onStopError: (error: unknown) => void = (error) => console.warn(error),
  ) {}

  handle(event: QuitEvent): void {
    if (this.ready) return

    event.preventDefault()
    if (this.stopping) return
    this.stopping = true
    void this.finish()
  }

  private async finish(): Promise<void> {
    try {
      await this.prepare()
    } catch (error) {
      this.onStopError(error)
    } finally {
      this.ready = true
      this.requestQuit()
    }
  }

  private prepare(): Promise<void> {
    this.preparation ??= this.finishPreparation()
    return this.preparation
  }

  private async finishPreparation(): Promise<void> {
    try {
      await withShutdownTimeout(this.stopRuntime(), 30_000)
    } finally {
      this.cleanup()
    }
    this.ready = true
  }
}

export async function withShutdownTimeout<T>(work: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Shutdown timed out after ${milliseconds}ms`)), milliseconds)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    clearTimeout(timer)
  }
}
