export type MenuCountSource = `notifications` | `teamRequests` | `actionEvents` | `wantedCandidates`

export function menuItemCount(source: MenuCountSource | undefined, counts: Partial<Record<MenuCountSource, number>>, placeholderCount = 0): number {
  const count = source ? counts[source] : placeholderCount
  return typeof count === `number` && Number.isFinite(count) && count >= 1 ? Math.trunc(count) : 0
}
