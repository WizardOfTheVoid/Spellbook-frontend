import { celebrateElement } from '../../utils/celebrate'

type RankingPosition = Readonly<{ id: string, rank: number, scopeKey: string }>

export function dashboardRankCelebration(node: HTMLElement, previous: RankingPosition, celebrate: (element: HTMLElement) => void = celebrateElement) {
  return {
    update(next: RankingPosition) {
      const promoted = next.id === previous.id && next.scopeKey === previous.scopeKey && previous.rank > 1 && next.rank === 1
      previous = next
      if (promoted) celebrate(node)
    },
  }
}
