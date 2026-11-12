import { readable, type Readable } from "svelte/store"
import { getCoreApi, type SentinelState } from "../core"

type SentinelApi = {
  sentinelState(): Promise<SentinelState>
  setSentinelEnabled(enabled: boolean): Promise<SentinelState>
  onSentinelStateChange(callback: (state: SentinelState) => void): () => void
}

export type SentinelModeStore = Readable<boolean> & {
  setEnabled(enabled: boolean): Promise<SentinelState>
}

export function createSentinelModeStore(api: SentinelApi): SentinelModeStore {
  const { subscribe } = readable(false, set => {
    let eventReceived = false
    const unsubscribe = api.onSentinelStateChange(state => {
      eventReceived = true
      set(state.enabled)
    })
    void api.sentinelState()
      .then(state => {
        if (!eventReceived) set(state.enabled)
      })
      .catch(() => undefined)

    return unsubscribe
  })

  return {
    subscribe,
    setEnabled: enabled => api.setSentinelEnabled(enabled)
  }
}

const mainSentinelApi: SentinelApi = {
  sentinelState: () => getCoreApi().sentinelState(),
  setSentinelEnabled: enabled => getCoreApi().setSentinelEnabled(enabled),
  onSentinelStateChange: callback => getCoreApi().onSentinelStateChange(callback)
}

export const sentinelModeEnabled = createSentinelModeStore(mainSentinelApi)

export function setSentinelModeEnabled(enabled: boolean): Promise<SentinelState> {
  return sentinelModeEnabled.setEnabled(enabled)
}

export function getAntiAfkControlState(
  sentinelEnabled: boolean,
  changing: boolean,
): { disabled: boolean; tooltip: string } {
  return {
    disabled: sentinelEnabled || changing,
    tooltip: sentinelEnabled
      ? `Auto enabled when Sentinel Mode is active`
      : `Prevents in-game auto kick`,
  }
}
