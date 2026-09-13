type QuitEvent = {
  preventDefault(): void
}

export class RuntimeQuitGuard {
  private ready = false
  private stopping = false

  constructor(
    private readonly stopRuntime: () => Promise<void>,
    private readonly cleanup: () => void,
    private readonly requestQuit: () => void,
    private readonly onStopError: (error: unknown) => void = error => console.warn(error)
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
      await this.stopRuntime()
    } catch (error) {
      this.onStopError(error)
    } finally {
      this.cleanup()
      this.ready = true
      this.requestQuit()
    }
  }
}
