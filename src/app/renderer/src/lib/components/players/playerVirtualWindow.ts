import type { Range, Virtualizer } from '@tanstack/svelte-virtual'

export type PlayerScrollAnchor = { key: string, offset: number }
type PlayerVirtualMeasurements = Pick<Virtualizer<HTMLElement, HTMLElement>, `getVirtualItemForOffset` | `getTotalSize` | `measurementsCache`>

export function getPlayerScrollAnchor(virtualizer: PlayerVirtualMeasurements, scrollTop: number): PlayerScrollAnchor | null {
  const item = virtualizer.getVirtualItemForOffset(scrollTop)
  return item ? { key: `${item.key}`, offset: Math.max(0, scrollTop - item.start) } : null
}

export function getPlayerScrollOffset(virtualizer: PlayerVirtualMeasurements, anchor: PlayerScrollAnchor | null, fallbackTop: number): number {
  virtualizer.getTotalSize()
  const item = anchor && virtualizer.measurementsCache.find(item => item.key === anchor.key)
  return item && anchor ? item.start + anchor.offset : fallbackTop
}

export function playerVirtualRows<T>(players: readonly T[], getKey: (player: T) => string, pinnedKeys: readonly string[]) {
  const pinned = pinnedKeys.map(key => players.findIndex(player => getKey(player) === key)).filter(index => index >= 0)
  return {
    count: players.length,
    estimateSize: () => 76,
    overscan: 6,
    getItemKey: (index: number) => getKey(players[index]),
    rangeExtractor: (range: Range): number[] => {
      const start = Math.max(0, range.startIndex - range.overscan)
      const end = Math.min(range.count - 1, range.endIndex + range.overscan)
      const visible = Array.from({ length: end - start + 1 }, (_, index) => start + index)
      return [...new Set([...visible, ...pinned])].sort((left, right) => left - right)
    }
  }
}
