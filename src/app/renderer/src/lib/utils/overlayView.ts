import type { ActivePage } from '$lib/types/ui'

export type OverlayView = ActivePage | 'player' | 'wanted-player'

export function resolveOverlayView(activePage: ActivePage, hasSelectedPlayer: boolean): OverlayView {
	if (!hasSelectedPlayer) return activePage
	if (activePage === `wanted`) return `wanted-player`
	return activePage === `server` || activePage === `players` ? `player` : activePage
}
