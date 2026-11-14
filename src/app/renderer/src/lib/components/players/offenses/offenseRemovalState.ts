import { writable } from 'svelte/store'
import type { OffenseTarget } from './offenseActions'

export const offenseRemoval = writable<{ target: OffenseTarget, actionId?: number, standalone: boolean } | null>(null)

export function openOffenseRemoval(target: OffenseTarget, actionId?: number, standalone = false) {
  offenseRemoval.set({ target, actionId, standalone })
}
