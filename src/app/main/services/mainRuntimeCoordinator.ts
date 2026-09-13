import type { CurrentGameSnapshotStore } from './currentGameSnapshotStore'

export type MainAuthState = Readonly<{
  authenticated: boolean
  onboardingComplete: boolean
}>

export type RuntimeWorker = {
  start(): void
  stop(): void | Promise<void>
}

export class MainRuntimeCoordinator {
  private generation = 0
  private transitionTail = Promise.resolve()
  private shutdownRequested = false

  constructor(
    private readonly workers: readonly RuntimeWorker[],
    private readonly snapshots: Pick<CurrentGameSnapshotStore, `clear`>,
    private readonly onStopError: (error: unknown) => void = error => console.warn(error)
  ) {}

  transition(state: MainAuthState): Promise<void> {
    if (this.shutdownRequested) return this.transitionTail

    const eligible = state.authenticated && state.onboardingComplete
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
    for (let index = this.workers.length - 1; index >= 0; index -= 1) {
      try {
        await this.workers[index]!.stop()
      } catch (error) {
        this.onStopError(error)
      }
    }
  }
}
