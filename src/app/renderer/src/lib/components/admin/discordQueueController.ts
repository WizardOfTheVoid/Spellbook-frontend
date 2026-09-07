import type { DiscordQueuePage } from '@spellbook/shared/discordBroadcasts.js'

export type DiscordQueueState = DiscordQueuePage & { loading: boolean, error: string | null }
const emptyState = (): DiscordQueueState => ({ deliveries: [], nextBeforeId: null, loading: false, error: null })

export class DiscordQueueController {
  state = emptyState()
  private userId: number | null = null
  private active = false
  private generation = 0

  constructor(
    private readonly list: (beforeId?: number) => Promise<DiscordQueuePage>,
    private readonly onChange: (state: DiscordQueueState) => void
  ) {}

  setContext(userId: number | null, active: boolean): boolean {
    if (this.userId === userId && this.active === active) return false
    this.userId = userId
    this.active = active
    this.generation += 1
    this.update(emptyState())
    return active && userId !== null
  }

  async load(more = false): Promise<void> {
    if (!this.active || this.userId === null || this.state.loading || (more && this.state.nextBeforeId === null)) return
    const generation = this.generation
    this.update({ ...this.state, loading: true, error: null })
    try {
      const page = await this.list(more ? this.state.nextBeforeId! : undefined)
      if (generation !== this.generation) return
      this.update({ ...page, deliveries: more ? [...this.state.deliveries, ...page.deliveries] : page.deliveries, loading: false, error: null })
    } catch (error) {
      if (generation !== this.generation) return
      this.update({ ...this.state, loading: false, error: error instanceof Error ? error.message : `Could not load message queues.` })
    }
  }

  private update(state: DiscordQueueState): void {
    this.state = state
    this.onChange(state)
  }
}
