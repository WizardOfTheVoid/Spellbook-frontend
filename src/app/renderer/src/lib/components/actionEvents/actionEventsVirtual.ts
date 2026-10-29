import { playerVirtualRows } from '../players/playerVirtualWindow'

export function actionEventsVirtualOptions(items: readonly { id: number }[], pinnedIds: readonly number[]) {
  return {
    ...playerVirtualRows(items, item => `${item.id}`, pinnedIds.map(String)),
    useAnimationFrameWithResizeObserver: true,
    estimateSize: () => 132,
    gap: 12
  }
}
