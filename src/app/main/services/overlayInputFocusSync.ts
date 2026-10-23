import type { CoreAppTarget } from '../../shared/coreAction'
import type { HttpClient } from '../api/http-client'

export class OverlayInputFocusSync {
  private sequence = 0
  private lastFocused?: boolean
  private pending?: { sequence: number, inputFocused: boolean }
  private request?: AbortController
  private retry?: ReturnType<typeof setTimeout>
  private stopped = false

  constructor(private readonly http: Pick<HttpClient, `callCore`>, private readonly appTarget: () => CoreAppTarget | null) {}

  publish(focused: boolean, force = false): void {
    if (this.stopped || (!force && focused === this.lastFocused)) return
    this.lastFocused = focused
    this.pending = { sequence: ++this.sequence, inputFocused: focused }
    clearTimeout(this.retry)
    void this.send()
  }

  stop(): void {
    this.stopped = true
    clearTimeout(this.retry)
    this.pending = undefined
    this.request?.abort()
  }

  private async send(): Promise<void> {
    if (this.stopped || this.request || !this.pending) return
    const app = this.appTarget()
    if (!app) return
    const state = this.pending
    this.pending = undefined
    const controller = new AbortController()
    this.request = controller
    const timeout = setTimeout(() => controller.abort(), 250)
    timeout.unref()
    let delivered = false
    try {
      delivered = (await this.http.callCore(`/v3/runtime/app/input-focus`, {
        method: `POST`, body: JSON.stringify({ app, ...state }), signal: controller.signal
      })).ok
    } catch {
      // Keep the latest state for a short delivery retry.
    } finally {
      clearTimeout(timeout)
      this.request = undefined
    }
    if (this.stopped) return
    if (this.pending) void this.send()
    else if (!delivered) {
      this.pending = state
      this.retry = setTimeout(() => { void this.send() }, 250)
      this.retry.unref()
    }
  }
}
