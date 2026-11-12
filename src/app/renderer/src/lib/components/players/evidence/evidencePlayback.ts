export class EvidencePlayback {
  private previous: { time: number, at: number } | null = null
  private elapsed = 0

  public get watchedMs(): number { return Math.floor(this.elapsed + 0.000001) }

  public start(time: number, at: number): void {
    this.previous = { time, at }
  }

  public suspend(): void { this.previous = null }

  public sample(time: number, at: number, rate = 1): boolean {
    const previous = this.previous
    if (previous) {
      this.previous = { time, at }
      const wall = at - previous.at
      const media = (time - previous.time) * 1000
      if (wall >= 0 && media >= 0 && rate > 0 && media <= wall * rate + 250) {
        this.elapsed += Math.min(wall, media / rate)
      }
    }
    return this.elapsed >= 2000 - 0.000001
  }

  public stop(time: number, at: number, rate = 1): boolean {
    const counted = this.sample(time, at, rate)
    this.suspend()
    return counted
  }
}
