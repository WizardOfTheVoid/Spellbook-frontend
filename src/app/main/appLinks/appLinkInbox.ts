import { parsePlayerAppUrl, type PendingPlayerLink } from '@spellbook/shared/appLinks'

export class AppLinkInbox {
  private current: PendingPlayerLink | null = null
  private sequence = 0
  private readonly listeners = new Set<() => void>()

  accept(value: string): boolean {
    const target = parsePlayerAppUrl(value)
    if (!target) return false
    this.current = { sequence: ++this.sequence, playfabId: target.playfabId }
    for (const listener of this.listeners) listener()
    return true
  }

  pending(): PendingPlayerLink | null {
    return this.current ? { ...this.current } : null
  }

  acknowledge(sequence: number): boolean {
    if (this.current?.sequence !== sequence) return false
    this.current = null
    return true
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}
