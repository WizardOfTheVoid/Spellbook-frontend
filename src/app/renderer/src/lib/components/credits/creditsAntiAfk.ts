type AntiAfkApi = {
  antiAfkState(): Promise<{ enabled: boolean }>
  setAntiAfkEnabled(enabled: boolean): Promise<{ enabled: boolean }>
}

export class CreditsAntiAfk {
  private originalEnabled: boolean | null = null
  private transitionTail = Promise.resolve()

  constructor(private readonly api: AntiAfkApi) {}

  async setActive(active: boolean): Promise<void> {
    const transition = this.applyAfter(this.transitionTail, active)
    this.transitionTail = transition.catch(() => undefined)
    await transition
  }

  private async applyAfter(previous: Promise<void>, active: boolean): Promise<void> {
    await previous
    if (active) {
      if (this.originalEnabled !== null) return
      this.originalEnabled = (await this.api.antiAfkState()).enabled
      if (!this.originalEnabled) await this.api.setAntiAfkEnabled(true)
    } else if (this.originalEnabled !== null) {
      await this.api.setAntiAfkEnabled(this.originalEnabled)
      this.originalEnabled = null
    }
  }
}
