import { isRecord, isPlayFabId } from '../../shared/telemetry/telemetryValidation'
import type { NameObservation } from '../../shared/telemetry/telemetryTypes'
import type { CoreCallResult } from '../types'

export class TelemetryNameCache {
  private cache = new Map<string, { expires: number; value: NameObservation | null }>()
  private epoch = 0
  constructor(
    private readonly get: (path: string) => Promise<CoreCallResult>,
    private readonly now: () => number = Date.now
  ) {}
  clear(): void {
    this.epoch++
    this.cache.clear()
  }
  async lookup(ids: string[]): Promise<NameObservation[]> {
    const epoch = this.epoch
    const pending = [...new Set(ids.filter(isPlayFabId).map((id) => id.toUpperCase()))]
    const results: NameObservation[] = []
    const work = async () => {
      while (pending.length && this.epoch === epoch) {
        const id = pending.shift()!
        const cached = this.cache.get(id)
        if (cached && cached.expires > this.now()) {
          if (cached.value) results.push(cached.value)
          continue
        }
        let value: NameObservation | null = null
        try {
          const response = await this.get(`/players/by-playfab/${id}`)
          const data =
            isRecord(response.data) && isRecord(response.data.data)
              ? response.data.data
              : response.data
          const player = isRecord(data) && isRecord(data.player) ? data.player : null
          if (
            response.ok &&
            typeof player?.latestName === `string` &&
            player.latestName.length > 0 &&
            player.latestName.length <= 256
          )
            value = {
              playFabId: id,
              name: player.latestName,
              source: `spellbookProduction`,
              observedAtUtc: new Date(this.now()).toISOString()
            }
        } catch {
          /* Replicated names and IDs remain usable during lookup failures. */
        }
        if (this.epoch !== epoch) return
        this.cache.set(id, { expires: this.now() + 600000, value })
        if (value) results.push(value)
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, pending.length) }, () => work()))
    return results
  }
}
