import type { PingVectorProfile } from '@spellbook/shared/forensics/altVectors'
import type { TriangulationProfile } from '@spellbook/shared/forensics/triangulation'
import type { CoreCallResult } from '../../core'
import { unwrap } from '../../utils/apiResult'
import { normalizeForensicsTab, type ForensicsTab } from './forensicsTabs'

type AnalysisTab = `ping` | `triangulate`
type AnalysisState<T> = { status: `idle` | `loading` | `ready` | `error`, data: T | null, error: string | null }
export type ForensicsState = {
  playerId: number | null
  accessDenied: boolean
  activeTab: ForensicsTab
  ping: AnalysisState<PingVectorProfile>
  triangulate: AnalysisState<TriangulationProfile>
}
const idle = <T>(): AnalysisState<T> => ({ status: `idle`, data: null, error: null })
export const initialForensicsState = (): ForensicsState => ({ playerId: null, accessDenied: false, activeTab: `ping`, ping: idle(), triangulate: idle() })

export function createForensicsController(readers: Record<AnalysisTab, (playerId: number) => Promise<CoreCallResult>>, publish: (state: ForensicsState) => void) {
  let generation = 0
  let session = ``
  let allowed = false
  let disposed = false
  let state = initialForensicsState()
  let pending: Partial<Record<AnalysisTab, Promise<void>>> = {}
  const update = (next: ForensicsState) => { state = next; publish({ ...state }) }
  const clear = (playerId: number | null = null, accessDenied = state.accessDenied) => {
    generation++
    pending = {}
    update({ ...state, playerId, accessDenied, ping: idle(), triangulate: idle() })
  }

  async function read(tab: AnalysisTab): Promise<void> {
    const current = generation
    const playerId = state.playerId!
    update({ ...state, [tab]: { status: `loading`, data: null, error: null } })
    try {
      const data = await unwrap<PingVectorProfile | TriangulationProfile>(await readers[tab](playerId), `Could not load this player. Please try again.`)
      if (disposed || current !== generation) return
      if (data.playerId !== playerId) throw new Error(`Could not load this player. Please try again.`)
      update({ ...state, [tab]: { status: `ready`, data, error: null } })
    } catch (error) {
      if (disposed || current !== generation) return
      const status = (error as { status?: number })?.status
      if (status === 401 || status === 403) { allowed = false; clear(null, true); return }
      update({ ...state, [tab]: { status: `error`, data: null, error: error instanceof Error ? error.message : `Could not load this player. Please try again.` } })
    }
  }

  async function loadActive(): Promise<void> {
    const tab = state.activeTab
    if (disposed || !allowed || state.playerId === null || tab === `friends` || tab === `rhythm` || state[tab].status === `ready`) return
    const current = generation
    const request = pending[tab] ?? read(tab)
    pending[tab] = request
    await request
    if (current === generation && pending[tab] === request) delete pending[tab]
  }

  return {
    setSession(accountId: number | null, isSuperadmin: boolean): void {
      if (disposed) return
      const next = `${accountId}:${isSuperadmin}`
      if (session === next) return
      session = next
      allowed = accountId !== null && isSuperadmin
      clear(null, false)
    },
    async selectPlayer(playerId: number | null): Promise<void> {
      if (disposed) return
      const valid = allowed && playerId !== null && Number.isSafeInteger(playerId) && playerId > 0
      const next = valid ? playerId : null
      if (state.playerId !== next) clear(next)
      await loadActive()
    },
    async selectTab(tab: ForensicsTab): Promise<void> {
      if (disposed) return
      update({ ...state, activeTab: normalizeForensicsTab(tab) })
      await loadActive()
    },
    dispose(): void { if (disposed) return; disposed = true; allowed = false; clear() }
  }
}
