import type { IpcMain } from 'electron'
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { TelemetryOrchestrator } from './telemetryOrchestrator'
import type { TelemetryUpdate } from '../../shared/telemetry/telemetryTypes'
import { isId, isRecord, requireValue } from '../../shared/telemetry/telemetryValidation'

type Subscription = {
  stop: () => void
  outstanding: boolean
  latest: TelemetryUpdate | null
  send: (update: TelemetryUpdate) => void
}
export class TelemetryIpc {
  private subscriptions = new Map<string, Subscription>()
  private owners = new WeakSet<Electron.WebContents>()
  private owner: Electron.WebContents | null = null
  constructor(
    private readonly ipc: Pick<IpcMain, `handle`>,
    private readonly telemetry: TelemetryOrchestrator,
    private readonly window: Pick<OverlayWindowController, `getCurrent`>,
    private readonly allowed: () => boolean
  ) {}
  private authorize(event: Electron.IpcMainInvokeEvent): void {
    if (
      !this.allowed() ||
      event.sender !== this.window.getCurrent()?.webContents ||
      !event.senderFrame ||
      event.senderFrame !== event.sender.mainFrame
    )
      throw new Error(`Telemetry is restricted to the signed-in main window`)
  }
  clear(): void {
    this.telemetry.cancelAllReads()
    for (const sub of this.subscriptions.values()) sub.stop()
    this.subscriptions.clear()
  }
  register(): void {
    this.ipc.handle(`telemetry:call`, async (event, operation: unknown, input: unknown) => {
      this.authorize(event)
      if (this.owner !== event.sender) {
        this.clear()
        this.owner = event.sender
      }
      if (!this.owners.has(event.sender)) {
        this.owners.add(event.sender)
        event.sender.on(`did-start-navigation`, navigation => {
          if (this.owner === event.sender && navigation.isMainFrame && !navigation.isSameDocument)
            this.clear()
        })
        event.sender.once(`destroyed`, () => {
          if (this.owner !== event.sender) return
          this.owner = null
          this.telemetry.cancelAllReads()
        })
      }
      requireValue(typeof operation === `string`)
      const result = await this.telemetry.call(operation, input)
      this.authorize(event)
      return result
    })
    this.ipc.handle(`telemetry:subscribe`, (event, request: unknown) => {
      this.authorize(event)
      requireValue(isRecord(request) && isId(request.subscriptionId))
      if (this.subscriptions.size >= 4) throw new Error(`Too many telemetry subscriptions`)
      const id = request.subscriptionId
      requireValue(!this.subscriptions.has(id), `Telemetry subscription already exists`)
      const send = (update: TelemetryUpdate) => {
        if (!this.allowed() || event.sender !== this.window.getCurrent()?.webContents || event.sender.isDestroyed()) return
        event.sender.send(`telemetry:update`, { subscriptionId: id, update })
      }
      const sub: Subscription = { stop: () => {}, outstanding: false, latest: null, send }
      this.subscriptions.set(id, sub)
      let stopWorker = () => {}
      const destroyed = () => sub.stop()
      sub.stop = () => {
        stopWorker()
        stopWorker = () => {}
        event.sender.off(`destroyed`, destroyed)
        this.subscriptions.delete(id)
      }
      try {
        stopWorker = this.telemetry.subscribe(
          request,
          (update) => {
            if (sub.outstanding) {
              sub.latest = { ...update, kind: `resync` }
              return
            }
            sub.outstanding = true
            send(update)
          },
          (error) => {
            if (this.allowed() && event.sender === this.window.getCurrent()?.webContents && !event.sender.isDestroyed())
              event.sender.send(`telemetry:streamError`, { subscriptionId: id, error })
          }
        )
      } catch (error) {
        sub.stop()
        throw error
      }
      event.sender.once(`destroyed`, destroyed)
    })
    this.ipc.handle(`telemetry:ack`, (event, id: unknown) => {
      this.authorize(event)
      if (typeof id !== `string`) return
      const sub = this.subscriptions.get(id)
      if (!sub) return
      sub.outstanding = false
      if (sub.latest) {
        const latest = sub.latest
        sub.latest = null
        sub.outstanding = true
        sub.send(latest)
      }
    })
    this.ipc.handle(`telemetry:unsubscribe`, (event, id: unknown) => {
      this.authorize(event)
      if (typeof id !== `string`) return
      this.subscriptions.get(id)?.stop()
      this.subscriptions.delete(id)
    })
  }
}
