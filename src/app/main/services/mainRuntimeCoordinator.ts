import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'

export type MainAuthState = Readonly<{
  authenticated: boolean
  onboardingComplete: boolean
  operational?: boolean
  consoleSetupReady?: boolean
}>

export type RuntimeWorker = {
  start(): void
  stop(): void | Promise<void>
}

export class MainRuntimeCoordinator {
  private generation = 0
  private transitionTail = Promise.resolve()
  private shutdownRequested = false
  private inputStarted = false

  constructor(
    private readonly workers: readonly RuntimeWorker[],
    private readonly snapshots: Pick<CurrentGameSnapshotStore, `clear`>,
    private readonly onStopError: (error: unknown) => void = error => console.warn(error),
    private readonly inputWorkers: readonly RuntimeWorker[] = []
  ) {}

  transition(state: MainAuthState): Promise<void> {
    if (this.shutdownRequested) return this.transitionTail

    const eligible = state.authenticated && state.onboardingComplete && state.operational !== false
    if (!eligible) this.snapshots.clear()
    const generation = ++this.generation
    const transition = this.transitionTail.then(async () => {
      if (!eligible) {
        await this.stopWorkers()
        this.snapshots.clear()
        return
      }

      if (generation === this.generation) {
        for (const worker of this.workers) worker.start()
        if (state.consoleSetupReady === true && !this.inputStarted) {
          this.inputStarted = true
          for (const worker of this.inputWorkers) worker.start()
        } else if (state.consoleSetupReady !== true && this.inputStarted) await this.stopInputWorkers()
      }
    })
    this.transitionTail = transition.catch(() => undefined)
    return transition
  }

  stop(): Promise<void> {
    return this.transition({ authenticated: false, onboardingComplete: false })
  }

  shutdown(): Promise<void> {
    if (this.shutdownRequested) return this.transitionTail

    this.shutdownRequested = true
    this.generation += 1
    this.snapshots.clear()
    const shutdown = this.transitionTail.then(async () => {
      await this.stopWorkers()
      this.snapshots.clear()
    })
    this.transitionTail = shutdown.catch(() => undefined)
    return shutdown
  }

  private async stopWorkers(): Promise<void> {
    if (this.inputStarted) await this.stopInputWorkers()
    for (let index = this.workers.length - 1; index >= 0; index -= 1) {
      try {
        await this.workers[index]!.stop()
      } catch (error) {
        this.onStopError(error)
      }
    }
  }

  private async stopInputWorkers(): Promise<void> {
    if (!this.inputStarted) return
    this.inputStarted = false
    for (const worker of [...this.inputWorkers].reverse()) {
      try { await worker.stop() } catch (error) { this.onStopError(error) }
    }
  }
}
