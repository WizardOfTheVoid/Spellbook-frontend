import type { IpcRenderer } from 'electron'
import type { TelemetryApi, TelemetryUpdate } from '../shared/telemetry/telemetryTypes'
import { isTelemetryUpdate } from '../shared/telemetry/telemetryValidation'
export function createTelemetryBridge(
  ipc: Pick<IpcRenderer, `invoke` | `on` | `removeListener`>
): TelemetryApi {
  const call = (method: string, input?: unknown) => ipc.invoke(`telemetry:call`, method, input)
  return {
    getStatus: () => call(`getStatus`),
    startRecording: (input) => call(`startRecording`, input),
    stopRecording: (id) => call(`stopRecording`, id),
    listRecordings: () => call(`listRecordings`),
    openRecording: (id) => call(`openRecording`, id),
    importRecording: (input) => call(`importRecording`, input),
    reprocessRecording: (id) => call(`reprocessRecording`, id),
    getJob: (id) => call(`getJob`, id),
    cancelJob: (id) => call(`cancelJob`, id),
    getFrame: (input) => call(`getFrame`, input),
    getPlayers: (input) => call(`getPlayers`, input),
    getMetricHistory: (input) => call(`getMetricHistory`, input),
    cancelReads: (input) => call(`cancelReads`, input),
    getTrajectories: (input) => call(`getTrajectories`, input),
    getEvents: (input) => call(`getEvents`, input),
    subscribeUpdates: (input, listener, failed) => {
      const subscriptionId = crypto.randomUUID()
      let closed = false
      const update = (
        _event: unknown,
        message: { subscriptionId: string; update: TelemetryUpdate }
      ) => {
        if (
          closed ||
          message.subscriptionId !== subscriptionId ||
          !isTelemetryUpdate(message.update)
        )
          return
        try {
          listener(message.update)
        } finally {
          void ipc.invoke(`telemetry:ack`, subscriptionId).catch(() => undefined)
        }
      }
      const error = (_event: unknown, message: { subscriptionId: string; error: string }) => {
        if (!closed && message.subscriptionId === subscriptionId) failed?.(message.error)
      }
      ipc.on(`telemetry:update`, update)
      ipc.on(`telemetry:streamError`, error)
      void ipc.invoke(`telemetry:subscribe`, { ...input, subscriptionId }).catch((reason) => {
        if (!closed)
          failed?.(reason instanceof Error ? reason.message : `Telemetry subscription failed`)
      })
      return () => {
        closed = true
        ipc.removeListener(`telemetry:update`, update)
        ipc.removeListener(`telemetry:streamError`, error)
        void ipc.invoke(`telemetry:unsubscribe`, subscriptionId).catch(() => undefined)
      }
    }
  }
}
